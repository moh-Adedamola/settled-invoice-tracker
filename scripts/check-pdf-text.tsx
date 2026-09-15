/**
 * Round-trip guard for the invoice PDF: render it, decode the text back out of
 * the file, and assert the source strings survived byte-exact.
 *
 *   npm run check:pdf
 *
 * ## Why this exists, and why nothing cheaper would do
 *
 * A PDF can be structurally impeccable and still have every string in it
 * corrupted. The document that prompted this guard:
 *
 *   - was a well-formed PDF with a correct object table and page tree
 *   - embedded five IBM Plex subsets, every one with a /FontFile2 program
 *   - carried no Helvetica fallback anywhere
 *   - drew 163 text operators on page one, so no page was blank
 *   - RENDERED PERFECTLY — rasterised and inspected, every glyph was right
 *
 * and `first instalment` came out of it as `irst lnstampent`.
 *
 * The cause was a ToUnicode CMap that cannot represent a glyph standing for
 * more than one codepoint. An `fi` ligature is exactly that, and a single
 * substitution misaligned the map for the rest of the run — so plain letters
 * after it were wrong too (`m` to `b`, `O` to `x`, `W` vanishing). The fix was
 * `fontFeatureSettings: { liga: false }` on the page style.
 *
 * Every structural check listed above passed on that document. Counting text
 * operators proves something was drawn; it says nothing about what a reader
 * gets when they select the line and copy it. **Decoding is the only check that
 * catches this class**, and it matters beyond tidiness: a client copying a line
 * out of an invoice, a mail client indexing an attachment, or an accounts
 * system parsing one, all silently receive mangled text while the page looks
 * immaculate.
 *
 * ## Multi-render corruption, and the `batch` case
 *
 * Every PDF after the first in one process used to decode as garbage —
 * `Harbor & Finch Consulting` came back as `rbr & Finch Cnsulting` — because
 * fontkit's glyph cache is shared across documents and freezes each glyph's
 * code points the first time it is seen. The cause and the fix are written up
 * in `src/lib/pdf/render-document.ts`; `render` below goes through that module,
 * which is the same entry point the app uses.
 *
 * The `batch` case is the regression test for it: ten documents in ONE process,
 * all ten round-tripped, alternating accented and plain text so the poisoning
 * path runs early and the letters it used to eat are read back later. Every
 * other case still gets its own child process, so one case can never explain
 * another's failure.
 */
import { inflateSync } from 'node:zlib';
import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { getInvoice, type InvoiceDetail } from '@/lib/queries/invoices';
import type { Settings } from '@/lib/queries/settings';
import { InvoiceDocument, renderInvoicePdf } from '@/lib/pdf/invoice';
import { renderDocumentToBuffer } from '@/lib/pdf/render-document';

/* -------------------------------------------------------------------------- */
/* Extraction: the PDF's own ToUnicode tables, no dependencies                 */
/* -------------------------------------------------------------------------- */

type PdfObject = { dict: string; start: number };

function parseObjects(latin: string): Map<number, PdfObject> {
  const objs = new Map<number, PdfObject>();
  for (const m of latin.matchAll(/(\d+)\s+0\s+obj\b/g)) {
    const start = m.index + m[0].length;
    const end = latin.indexOf('endobj', start);
    if (end !== -1) objs.set(Number(m[1]), { dict: latin.slice(start, end), start });
  }
  return objs;
}

function streamOf(buf: Buffer, latin: string, obj: PdfObject | undefined): Buffer | null {
  if (!obj) return null;
  const sIdx = obj.dict.indexOf('stream');
  if (sIdx === -1) return null;
  let p = obj.start + sIdx + 'stream'.length;
  if (latin[p] === '\r') p++;
  if (latin[p] === '\n') p++;
  const endIdx = latin.indexOf('endstream', p);
  if (endIdx === -1) return null;
  const raw = buf.subarray(p, endIdx);
  if (!/\/FlateDecode/.test(obj.dict)) return raw;
  try {
    return inflateSync(raw);
  } catch {
    return null;
  }
}

const hexToString = (hex: string): string => {
  let out = '';
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return out;
};

/** Glyph code to the unicode it claims to stand for. Handles bfchar and bfrange. */
function parseCMap(text: string): Map<number, string> {
  const map = new Map<number, string>();

  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      map.set(parseInt(p[1]!, 16), hexToString(p[2]!));
    }
  }

  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      const lo = parseInt(r[1]!, 16);
      const hi = parseInt(r[2]!, 16);
      const base = r[3]!;
      for (let c = lo; c <= hi; c++) {
        const tail = (parseInt(base.slice(-4), 16) + (c - lo)).toString(16).padStart(4, '0');
        map.set(c, hexToString(base.slice(0, -4) + tail));
      }
    }
    for (const r of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g)) {
      const lo = parseInt(r[1]!, 16);
      [...r[3]!.matchAll(/<([0-9A-Fa-f]*)>/g)]
        .map((i) => hexToString(i[1]!))
        .forEach((s, i) => map.set(lo + i, s));
    }
  }

  return map;
}

type LoadedFont = { base: string; cmap: Map<number, string> };

/**
 * Decodes every text run, with two correctness details that each produced a
 * false alarm while this was being written:
 *
 *  1. Font names are resolved from the PAGE'S OWN /Resources dictionary. `/F5`
 *     means different fonts in different resource dictionaries, so a global
 *     name scan reports one font's glyph codes through another's table.
 *  2. The TJ array pattern is `\[([^[\]]*)\]` — no nesting. A lazy `[\s\S]*?`
 *     spans from an SVG dash-array across path data to a later TJ, inventing a
 *     text run out of vector geometry. That is where a phantom "06D1" came
 *     from, on a page whose PAID badge was perfectly correct.
 *
 * Both made a sound PDF look broken. A guard that cries wolf is worse than no
 * guard, so the shapes are pinned here deliberately.
 */
function extractRuns(buf: Buffer): Array<{ font: string; text: string }> {
  const latin = buf.toString('latin1');
  const objs = parseObjects(latin);
  const runs: Array<{ font: string; text: string }> = [];
  const pages = [...objs.values()].filter((o) => /\/Type\s*\/Page(?![s])/.test(o.dict));

  for (const page of pages) {
    const fonts = new Map<string, LoadedFont>();
    const resRef = /\/Resources\s+(\d+)\s+0\s+R/.exec(page.dict);
    const resDict = resRef ? (objs.get(Number(resRef[1]))?.dict ?? '') : page.dict;
    const fontIdx = resDict.indexOf('/Font');
    const region = fontIdx === -1 ? '' : resDict.slice(fontIdx, fontIdx + 800);

    for (const m of region.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
      const fontObj = objs.get(Number(m[2]));
      if (!fontObj || !/\/BaseFont/.test(fontObj.dict)) continue;
      const base = /\/BaseFont\s*\/([A-Za-z0-9+#._-]+)/.exec(fontObj.dict)?.[1] ?? '?';
      const tuRef = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(fontObj.dict)?.[1];
      const stream = tuRef ? streamOf(buf, latin, objs.get(Number(tuRef))) : null;
      fonts.set(m[1]!, { base, cmap: stream ? parseCMap(stream.toString('latin1')) : new Map() });
    }

    const contentRef = /\/Contents\s+(\d+)\s+0\s+R/.exec(page.dict);
    const content = contentRef ? streamOf(buf, latin, objs.get(Number(contentRef[1]))) : null;
    if (!content) continue;
    const text = content.toString('latin1');

    let current: LoadedFont | null = null;
    for (const op of text.matchAll(
      /\/([A-Za-z0-9]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj|\[([^[\]]*)\]\s*TJ/g,
    )) {
      if (op[1] !== undefined) {
        current = fonts.get(op[1]) ?? current;
        continue;
      }
      const hexes =
        op[2] !== undefined ? [op[2]] : [...op[3]!.matchAll(/<([0-9A-Fa-f]*)>/g)].map((h) => h[1]!);
      let piece = '';
      for (const hex of hexes) {
        for (let i = 0; i + 4 <= hex.length; i += 4) {
          piece += current?.cmap.get(parseInt(hex.slice(i, i + 4), 16)) ?? '�';
        }
      }
      if (piece) runs.push({ font: current?.base ?? '(none)', text: piece });
    }
  }

  return runs;
}

/* -------------------------------------------------------------------------- */
/* The hazards                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Every string here broke, or could break, the ToUnicode map.
 *
 * The ligature rows are the regression this guard was written for. The others
 * are the neighbours worth holding down at the same time: the naira sign is the
 * base currency and was absent from the first font cut vendored here, and the
 * accented names are why only `liga` is disabled rather than `ccmp` as well.
 */
const LIGATURE_LINES = [
  'first fix and final fixes',             // fi
  'Flutterwave reflow, offline fallback',  // fl
  'Offline offer, off-cycle staff',        // ff
  'Office affix, sufficient traffic',      // ffi
  'Waffle shuffle, baffling snuffle',      // ffl
];

const OTHER_HAZARDS = [
  'Adebayo Oyelaran and Zoe Fitzwilliam',
  'Adébáyò Òyèlárán, café, naïve, Zoë',
  'Retainer 2.5 days at 125,000.00 each',
  'Half a day 1/2 and three quarters 3/4',
];

/* -------------------------------------------------------------------------- */
/* Assertions                                                                 */
/* -------------------------------------------------------------------------- */

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
}

/**
 * Asserts a string survived the round trip.
 *
 * Runs are joined before searching, and whitespace is normalised on both
 * sides, because a renderer may legitimately split one source string across
 * several text operators for kerning — `14 Admiralty Way` comes back as
 * `"14 "` and `"Admiralty Way"`, and rejoining them doubles the space. What
 * must not happen is a NON-space character changing or disappearing, and that
 * no amount of whitespace normalising can hide.
 */
function survives(runs: Array<{ text: string }>, expected: string, label: string): void {
  const joined = runs.map((r) => r.text).join(' ');
  const squeezed = joined.replace(/\s+/g, ' ');
  const stripped = joined.replace(/\s+/g, '');
  const ok =
    squeezed.includes(expected.replace(/\s+/g, ' ')) ||
    stripped.includes(expected.replace(/\s+/g, ''));
  check(label, ok, ok ? '' : `not found; nearest run: ${JSON.stringify(nearest(runs, expected))}`);
}

/** The run sharing the most leading characters, to make a failure readable. */
function nearest(runs: Array<{ text: string }>, expected: string): string {
  let best = '';
  let bestScore = -1;
  for (const r of runs) {
    let i = 0;
    while (i < r.text.length && i < expected.length && r.text[i] === expected[i]) i++;
    if (i > bestScore) {
      bestScore = i;
      best = r.text;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** A minimal invoice shaped entirely from hazards, needing no database. */
function syntheticInvoice(lines: string[], status: InvoiceDetail['status']): InvoiceDetail {
  const lineItems = lines.map((description, n) => ({
    id: `guard-${n}`,
    position: n + 1,
    description,
    quantity: '1.000',
    unitAmountMinor: 100_000_00n,
    lineAmountMinor: 100_000_00n,
  }));

  return {
    id: '00000000-0000-4000-8000-000000000000',
    number: 'INV-GUARD-0001',
    currency: 'NGN',
    amountMinor: BigInt(lineItems.length) * 100_000_00n,
    paidMinor: 0n,
    outstandingMinor: BigInt(lineItems.length) * 100_000_00n,
    status,
    storedStatus: status,
    description: 'Guard fixture — first fix, offline sync, Office integration',
    issuedAt: new Date(Date.UTC(2026, 3, 5)),
    dueAt: new Date(Date.UTC(2026, 4, 5)),
    sentAt: new Date(Date.UTC(2026, 3, 5)),
    paidAt: null,
    daysOverdue: status === 'overdue' ? 16 : 0,
    client: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Adébáyò Òyèlárán Office Fittings',
      email: 'first.office@example.test',
      address: ['14 Admiralty Way', 'Lekki Phase 1, Lagos'].join('\n'),
    },
    lineItems,
    payments: [],
    reminders: [],
    base: null,
  };
}

const GUARD_SETTINGS: Settings = {
  businessName: 'Settled Guard Fixtures',
  businessAddress: ['14 Admiralty Way', 'Lekki Phase 1, Lagos'].join('\n'),
  businessEmail: 'accounts@example.test',
  businessPhone: '+234 802 555 0101',
  remindersEnabled: true,
  reminderDay1: 3,
  reminderDay2: 7,
  reminderDay3: 14,
  telegramChatId: '',
  alertOnPaymentSuccess: false,
  alertOnPaymentFailure: true,
  updatedAt: new Date(0),
  persisted: false,
};

/** The same entry point the app renders through, reset included. */
const render = (invoice: InvoiceDetail, settings: Settings) =>
  renderDocumentToBuffer(InvoiceDocument({ invoice, settings }));

/* -------------------------------------------------------------------------- */
/* Cases — one document each, one process each                                */
/* -------------------------------------------------------------------------- */

const CASE_NAMES = [
  'hazards',
  'badge-paid',
  'badge-overdue',
  'badge-sent',
  'badge-partial',
  'badge-draft',
  'badge-void',
  'zero-decimal',
  'batch',
  'real',
] as const;
type CaseName = (typeof CASE_NAMES)[number];

/**
 * Every badge state, because the labels come from a mapping that is easy to
 * index with the wrong vocabulary: this guard's first run caught `sent`
 * printing a DRAFT badge, the schema status having no entry in a table keyed by
 * presentation state.
 */
const BADGE_FOR: Record<string, { status: InvoiceDetail['status']; label: string }> = {
  'badge-paid': { status: 'paid', label: 'PAID' },
  'badge-overdue': { status: 'overdue', label: 'OVERDUE' },
  'badge-sent': { status: 'sent', label: 'SENT' },
  'badge-partial': { status: 'partial', label: 'PARTIAL' },
  'badge-draft': { status: 'draft', label: 'DRAFT' },
  'badge-void': { status: 'void', label: 'VOID' },
};

/**
 * Ten documents, one process — the regression test for the shared glyph cache.
 *
 * The names alternate on purpose. An accented name renders composite glyphs,
 * and resolving those for the subset is what used to cache their base letters
 * with no code points at all; the plain names that follow are read back to
 * prove the letters survived. `Harbor` and `oak` are the exact strings that
 * used to come out as `rbr` and `ak`, so they are spelled out rather than
 * generated.
 *
 * Documents 2 and 9 mix both in ONE document, which covers the other ordering:
 * poisoning inside a single render rather than between two.
 */
const BATCH_NAMES = [
  'Adébáyò Òyèlárán Office Fittings',
  'Harbor & Finch Consulting',
  'Zoë Fitzwilliam Studios',
  'Oakwood Partners',
  'Adébáyò Òyèlárán Office Fittings',
  'Harbor & Finch Consulting',
  'Café Ndidi Roasters',
  'Oakwood Partners',
  'Òkanlàwón Naïve Ltd',
  'Harbor & Finch Consulting',
] as const;

const BATCH_LINES = [
  'Adébáyò Òyèlárán, café, naïve, Zoë',
  'Harbor and oak, a normal ascii line',
] as const;

async function runBatch(): Promise<void> {
  for (let n = 0; n < BATCH_NAMES.length; n++) {
    const name = BATCH_NAMES[n]!;
    const invoice = {
      ...syntheticInvoice([...BATCH_LINES, ...LIGATURE_LINES], 'sent'),
      number: `INV-BATCH-${String(n + 1).padStart(4, '0')}`,
      client: { ...syntheticInvoice([], 'sent').client, name },
    };

    const runs = extractRuns(await render(invoice, GUARD_SETTINGS));
    const label = `document ${String(n + 1).padStart(2, ' ')} of 10`;

    const bad = runs.filter((r) => r.text.includes('�'));
    check(`${label}: every glyph decodes`, bad.length === 0, bad.length ? JSON.stringify(bad[0]!.text) : '');
    survives(runs, name, `${label}: client name ${JSON.stringify(name)}`);
    for (const line of BATCH_LINES) survives(runs, line, `${label}: ${JSON.stringify(line.slice(0, 26))}`);
    survives(runs, invoice.number, `${label}: number ${invoice.number}`);
    survives(runs, '₦', `${label}: the naira sign`);
    survives(runs, LIGATURE_LINES[0]!, `${label}: ${JSON.stringify(LIGATURE_LINES[0]!.slice(0, 26))}`);
  }
}

/**
 * A zero-decimal currency, all the way through to the rendered page.
 *
 * Every amount in this ledger is stored as major x 100 regardless of currency,
 * so ¥500 is the bigint 50000. The formatter has to divide by 100 AND then not
 * print the two places it just divided out — and that second half is easy to
 * lose, because "500.00" is a plausible-looking number that no test asserting
 * "the amount appears" would ever catch.
 *
 * It belongs in THIS guard rather than only in `test-money` because the invoice
 * PDF is the one place these figures go to a client. A unit test proves the
 * function; decoding the finished document proves that the function is what the
 * document actually used, through the `Money` component, the line table and the
 * totals block.
 */
async function runZeroDecimal(): Promise<void> {
  const base = syntheticInvoice(['Localisation sprint', 'Tokyo office support'], 'sent');
  const invoice: InvoiceDetail = {
    ...base,
    number: 'INV-GUARD-JPY1',
    currency: 'JPY',
    // 50000 stored = ¥500. Two lines, so the total is ¥1,000.
    amountMinor: 100_000n,
    outstandingMinor: 100_000n,
    lineItems: base.lineItems.map((line) => ({
      ...line,
      unitAmountMinor: 50_000n,
      lineAmountMinor: 50_000n,
    })),
  };

  const runs = extractRuns(await render(invoice, GUARD_SETTINGS));
  const joined = runs.map((r) => r.text).join(' ').replace(/\s+/g, ' ');

  check('the JPY document decodes', runs.length > 0, `${runs.length} runs`);
  survives(runs, 'INV-GUARD-JPY1', 'invoice number');

  // The line unit amount, the line total and the grand total.
  survives(runs, '500', 'a line amount renders as 500');
  survives(runs, '1,000', 'the total renders as 1,000');

  /*
   * The assertion that would have failed before the fix. Checked against the
   * whole decoded page rather than a single run, because the digits can be
   * split across text operators for kerning — the thing that must not appear
   * anywhere is the trailing ".00".
   */
  const hasCents = /\b(500|1,000)\.00\b/.test(joined);
  check(
    'NO trailing .00 anywhere on a zero-decimal invoice',
    !hasCents,
    hasCents ? `found: ${joined.match(/\b(?:500|1,000)\.00\b/)?.[0]}` : '',
  );

  // And the control: the same stored value in a two-decimal currency MUST
  // carry its places, so the rule above is currency-sensitive rather than a
  // blanket "never print decimals".
  const ngn = extractRuns(await render({ ...invoice, currency: 'NGN' }, GUARD_SETTINGS));
  const ngnJoined = ngn.map((r) => r.text).join(' ').replace(/\s+/g, ' ');
  check(
    'CONTROL: the same value in NGN does render 500.00',
    /500\.00/.test(ngnJoined),
    /500\.00/.test(ngnJoined) ? '' : 'the two-decimal path regressed',
  );
}

async function runCase(name: CaseName): Promise<void> {
  if (name === 'hazards') {
    const runs = extractRuns(
      await render(syntheticInvoice([...LIGATURE_LINES, ...OTHER_HAZARDS], 'sent'), GUARD_SETTINGS),
    );

    check('the document decodes to text', runs.length > 0, `${runs.length} runs`);
    check('every run resolved a font', runs.every((r) => r.font !== '(none)'));
    check(
      'no run contains an unmappable character',
      !runs.some((r) => r.text.includes('�')),
      runs.filter((r) => r.text.includes('�')).map((r) => JSON.stringify(r.text)).join(' ').slice(0, 120),
    );

    for (const line of LIGATURE_LINES) survives(runs, line, `ligature: ${JSON.stringify(line.slice(0, 34))}`);
    for (const line of OTHER_HAZARDS) survives(runs, line, `hazard:   ${JSON.stringify(line.slice(0, 34))}`);

    survives(runs, '₦', 'the naira sign survives');
    survives(runs, 'Adébáyò Òyèlárán Office Fittings', 'the accented client name survives');
    survives(runs, '14 Admiralty Way', 'the client address survives');
    survives(runs, 'INV-GUARD-0001', 'the invoice number survives');
    return;
  }

  if (name === 'zero-decimal') {
    await runZeroDecimal();
    return;
  }

  if (name === 'batch') {
    await runBatch();
    return;
  }

  const badge = BADGE_FOR[name];
  if (badge) {
    const runs = extractRuns(await render(syntheticInvoice(LIGATURE_LINES, badge.status), GUARD_SETTINGS));
    survives(runs, badge.label, `badge label ${badge.label} decodes`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    // Not a failure: the hazards are the regression guard and need no database.
    // Real rows are an extra pass over strings nobody chose.
    console.log('  SKIP  DATABASE_URL is not set, so no real invoice was checked');
    return;
  }

  /*
   * Several real invoices, rendered through `renderInvoicePdf` in ONE process.
   *
   * This is the cron's exact shape: `dispatch-outbound` calls that same
   * function once per queued email in a single invocation. Rendering one
   * invoice would test the function; rendering five tests the thing that
   * actually broke.
   *
   * Longest names first, so whichever rows the demo holds, the sample leans
   * towards the ones with the most to lose.
   */
  const rows = (
    await db.execute(sql`
      select i.id::text as id
      from invoices i
      join clients c on c.id = i.client_id
      where i.status <> 'draft'
        and exists (select 1 from invoice_line_items l where l.invoice_id = i.id)
      order by length(c.name) desc, i.number
      limit 5
    `)
  ).rows as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    console.log('  SKIP  no invoice with line items in the database');
    return;
  }

  for (const row of rows) {
    const id = String(row.id);
    const invoice = await getInvoice(id);
    if (!invoice) {
      check('the sampled invoice loads', false, id);
      continue;
    }

    const runs = extractRuns(await renderInvoicePdf(id));
    const label = invoice.number;

    check(`${label}: decodes`, runs.length > 0, `${runs.length} runs`);
    check(`${label}: every glyph decodes`, !runs.some((r) => r.text.includes('�')));
    survives(runs, invoice.number, `${label}: invoice number`);
    survives(runs, invoice.client.name, `${label}: client ${JSON.stringify(invoice.client.name)}`);
    const line = invoice.lineItems[0];
    if (line) survives(runs, line.description, `${label}: line ${JSON.stringify(line.description.slice(0, 32))}`);
  }
}

/* -------------------------------------------------------------------------- */

async function main() {
  const requested = process.argv
    .find((a) => a.startsWith('--case='))
    ?.slice('--case='.length) as CaseName | undefined;

  // Child: run one case, report through the exit code.
  if (requested) {
    await runCase(requested);
    if (failed > 0) console.log(`  ${failed} failed, ${passed} passed`);
    process.exit(failed === 0 ? 0 : 1);
  }

  // Parent: one child per case, so no document shares font state with another.
  const { spawnSync } = await import('node:child_process');
  let anyFailed = false;

  for (const name of CASE_NAMES) {
    console.log(`--- ${name} ---`);
    const result = spawnSync(
      process.execPath,
      [...process.execArgv, process.argv[1]!, `--case=${name}`],
      { stdio: 'inherit', env: process.env },
    );
    if (result.status !== 0) anyFailed = true;
  }

  console.log(anyFailed ? '\nFAILED — see the cases above.' : '\nAll cases passed.');
  process.exit(anyFailed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
