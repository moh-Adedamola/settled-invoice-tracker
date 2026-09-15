import 'server-only';

import { join } from 'node:path';
import {
  Circle,
  Document,
  Font,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';

import type { DocumentProps, Style } from '@react-pdf/types';

import type { InvoiceDetail } from '@/lib/queries/invoices';
import type { EffectiveStatus } from '@/lib/queries/invoice-status';
import {
  invoiceStatusKey,
  type StatusKey,
} from '@/components/ui/status-badge';
import type { ReadScope } from '@/lib/read-scope';
import { renderDocumentToBuffer } from '@/lib/pdf/render-document';
import { getInvoice } from '@/lib/queries/invoices';
import { getSettings, type Settings } from '@/lib/queries/settings';
import { currencySymbol, formatDateFull, formatMinorDigits } from '@/lib/format';
import { formatQuantityDisplay } from '@/lib/money';

/* ==========================================================================
   The invoice PDF.
   ==========================================================================

   ## This is paper, not a screen

   §3's dark theme is the product's identity and none of it transfers: ink on a
   dark ground becomes toner on white, and a document printed at a client's
   office has no theme at all. So the LIGHT palette is the starting point, and
   every pair was re-measured against #ffffff rather than against the light
   theme's warm #f9f8f5 ground:

     fg-primary  16.41:1   fg-secondary 7.77:1   fg-muted 4.87:1
     accent      5.74:1    line-strong  3.45:1

   All of them land slightly ABOVE their on-screen figures, because white is
   lighter than the screen's paper-white. Nothing needed re-picking for print;
   what needed checking was whether that was true, and it is.

   Copper survives. `#9a541b` on white is 5.74:1 — a burnt orange that reads as
   a deliberate brand mark rather than a washed-out tint, which is the failure
   mode when a dark-theme accent (`#d7935e`, a pale peach) is moved to paper
   unchanged. The light token is the one to use precisely because it was chosen
   against a light ground.

   ## Greyscale is the real constraint

   Measured: the eight status tints occupy lightness 84-87 with a ZERO-point gap
   between adjacent pairs. On a mono printer they are the same grey. The tint
   therefore carries nothing on paper, and the §3.3 rule — the marker travels
   with the colour — stops being a nicety and becomes the only thing conveying
   state. Every badge here prints its glyph.

   ## Fonts must be registered, and must be checked

   @react-pdf/renderer silently falls back to Helvetica for anything it cannot
   resolve, which produces a plausible-looking PDF in the wrong typeface — the
   exact failure this file is most likely to have. The TTFs are vendored under
   ./fonts and registered from disk, so there is no network call at render time
   and no chance of a CDN 404 becoming a silent fallback. The verification
   script asserts IBMPlex appears in the PDF's embedded font table.
   ========================================================================== */

const FONT_DIR = join(process.cwd(), 'src', 'lib', 'pdf', 'fonts');

let fontsReady = false;

/**
 * Idempotent: `renderInvoicePdf` may be called many times in one process, and
 * re-registering a family on every call leaks work into every render.
 */
function registerFonts() {
  if (fontsReady) return;

  Font.register({
    family: 'IBM Plex Sans',
    fonts: [
      { src: join(FONT_DIR, 'IBMPlexSans-400.ttf'), fontWeight: 400 },
      { src: join(FONT_DIR, 'IBMPlexSans-500.ttf'), fontWeight: 500 },
      { src: join(FONT_DIR, 'IBMPlexSans-600.ttf'), fontWeight: 600 },
    ],
  });

  Font.register({
    family: 'IBM Plex Mono',
    fonts: [
      { src: join(FONT_DIR, 'IBMPlexMono-400.ttf'), fontWeight: 400 },
      { src: join(FONT_DIR, 'IBMPlexMono-500.ttf'), fontWeight: 500 },
    ],
  });

  /*
   * Hyphenation off.
   *
   * react-pdf hyphenates by default, which on a line-item description produces
   * breaks like "consul-tancy" in the middle of a document a client reads. A
   * callback returning the whole word is the documented way to disable it.
   */
  Font.registerHyphenationCallback((word) => [word]);

  fontsReady = true;
}

/* -------------------------------------------------------------------------- */
/* The print palette                                                          */
/* -------------------------------------------------------------------------- */

const INK = {
  primary: '#192029',
  secondary: '#4c535d',
  muted: '#6b727a',
  accent: '#9a541b',
  lineStrong: '#8d8a83',
  lineDefault: '#d3d1cb',
  lineSubtle: '#d9d6cf',
  paper: '#ffffff',
  inset: '#f9f8f5',
} as const;

/**
 * §3.2's light values, with the marker DRAWN rather than typed.
 *
 * The design system names the markers by codepoint — ● ◐ ½ ▲ ○ — — and four of
 * those do not exist in IBM Plex. Not in the webfont subset and not in the
 * complete 1,019-glyph cut either: IBM Plex has no Geometric Shapes block at
 * all. On screen that is invisible, because the browser quietly falls back to a
 * system font for those four characters. A PDF has no fallback to quietly make.
 *
 * So `paid`, `pending`, `overdue` and `draft` draw their marker as vector art,
 * and `partial` (½) and `void` (—) keep the glyph, which Plex does have. Drawing
 * is the better answer regardless of the gap: the shape is exact at any size
 * and prints as solid geometry, which matters because the tints are
 * indistinguishable in greyscale and the marker is doing all the work.
 */
type MarkerShape = 'filled' | 'half' | 'triangle' | 'open' | { glyph: string };

/**
 * Keyed by PRESENTATION state, and indexed through `invoiceStatusKey` — never
 * by an invoice status directly.
 *
 * This table used to be indexed with the effective invoice status, which is a
 * different vocabulary: §3.2 maps the schema's `sent` onto the presentation
 * state `pending`. There is no `sent` key here, so `STATUS_PRINT['sent']` was
 * undefined and fell through to the `?? draft` fallback — **every sent invoice
 * printed a DRAFT badge**, on the document the client receives. It went
 * unnoticed because the PDFs I had looked at were paid, partial and overdue.
 *
 * `invoiceStatusKey` is the single definition of that mapping and the one the
 * screens use, so the badge on the PDF and the badge on the invoice page cannot
 * disagree again. Labels come from there too rather than being restated here.
 */
const STATUS_PRINT: Record<
  StatusKey,
  { fg: string; bg: string; border: string; marker: MarkerShape }
> = {
  paid: { fg: '#07553f', bg: '#dcf6ec', border: '#8dc9b4', marker: 'filled' },
  pending: { fg: '#0f69a4', bg: '#dcf0fb', border: '#93c2e0', marker: 'half' },
  partial: { fg: '#2f2903', bg: '#f4f1de', border: '#d6d2ba', marker: { glyph: '½' } },
  overdue: { fg: '#846500', bg: '#fbefd0', border: '#d3b675', marker: 'triangle' },
  failed: { fg: '#9a0a2c', bg: '#fde7ea', border: '#e2949f', marker: { glyph: '✕' } },
  refunded: { fg: '#622c91', bg: '#f2e9fb', border: '#bfa0da', marker: { glyph: '↺' } },
  draft: { fg: '#3e5873', bg: '#e9eef4', border: '#a8b6c6', marker: 'open' },
  void: { fg: '#646d77', bg: '#eef0f2', border: '#bcc1c6', marker: { glyph: '—' } },
};

/* -------------------------------------------------------------------------- */
/* Measurements                                                               */
/* -------------------------------------------------------------------------- */

/*
 * The amount column is the reason this document exists in a monospaced face.
 *
 * Every money cell is IBM Plex Mono at a FIXED width, right-aligned, so the
 * decimal points stack down the column exactly as they do on screen. A
 * proportional face would put a different advance on every digit and the column
 * would ripple — which is the whole premise of the ledger undone on the one
 * artefact a client actually keeps.
 */
const COL = {
  position: 24,
  description: 224,
  quantity: 52,
  unit: 82,
  amount: 92,
} as const;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56, // room for the page-number footer
    paddingHorizontal: 44,
    fontFamily: 'IBM Plex Sans',
    fontSize: 9,
    color: INK.primary,
    backgroundColor: INK.paper,
    /*
     * LIGATURES OFF, and this is load-bearing rather than typographic taste.
     *
     * @react-pdf/renderer writes a ToUnicode CMap so a reader can copy text out
     * of the PDF. It does not handle a glyph that stands for MORE THAN ONE
     * codepoint, and an `fi` ligature is exactly that. One substitution
     * misaligns the rest of the map, so the corruption is not confined to the
     * ligature — it runs to the end of the run. Measured, same string, same
     * document:
     *
     *   liga on    "Bank transfer - irst lnstampent"
     *   liga off   "Bank transfer - first instalment"
     *
     * and with several ligatures, "Office affix" came out "xf;ce af;W".
     *
     * The page still RENDERED correctly throughout — rasterised and inspected,
     * every glyph was right. Only extraction was wrong, which is the worse way
     * for it to be wrong: a client copying a line out of an invoice, or any
     * system indexing one, silently gets corrupted text and nothing looks
     * broken.
     *
     * IBM Plex Mono is unaffected because it ships no `liga` feature, which is
     * what localised the fault: Mono extracted perfectly in every arrangement
     * while Sans failed in all of them.
     *
     * Only `liga` is disabled. `ccmp` composes and positions combining marks,
     * so turning it off would risk accented client names; verified unnecessary
     * — with `liga` off alone, "Adébáyò Òyèlárán, café, naïve, Zoë", fractions,
     * the fraction slash and precomposed U+FB01 all extract byte-identical.
     *
     * Inherited by every Text on the page, including nested ones and other
     * weights — also verified, rather than assumed.
     */
    fontFeatureSettings: { liga: false },
  },

  masthead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  businessName: { fontSize: 15, fontWeight: 600, color: INK.accent, marginBottom: 4 },
  businessLine: { fontSize: 8, color: INK.secondary, lineHeight: 1.5 },

  docLabel: {
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1.4,
    color: INK.muted,
    textAlign: 'right',
    marginBottom: 3,
  },
  docNumber: {
    fontFamily: 'IBM Plex Mono',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'right',
    marginBottom: 7,
  },

  badge: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    alignItems: 'center',
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 2,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  badgeMarker: { fontSize: 7, marginRight: 3 },
  badgeLabel: { fontSize: 7, fontWeight: 500, letterSpacing: 0.6 },

  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  partyBlock: { width: 232 },
  eyebrow: {
    fontSize: 7,
    fontWeight: 500,
    letterSpacing: 1,
    color: INK.muted,
    marginBottom: 5,
  },
  partyName: { fontSize: 10, fontWeight: 500, marginBottom: 3 },
  partyLine: { fontSize: 8, color: INK.secondary, lineHeight: 1.5 },

  factRow: { flexDirection: 'row', marginBottom: 3 },
  factLabel: { fontSize: 8, color: INK.muted, width: 58 },
  factValue: { fontFamily: 'IBM Plex Mono', fontSize: 8, color: INK.primary },

  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK.lineStrong,
    paddingBottom: 5,
    marginBottom: 2,
  },
  headCell: { fontSize: 7, fontWeight: 500, letterSpacing: 0.8, color: INK.muted },

  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK.lineSubtle,
    paddingVertical: 6,
  },
  cell: { fontSize: 9, color: INK.primary },
  money: { fontFamily: 'IBM Plex Mono', fontSize: 9, textAlign: 'right' },
  moneyMuted: { fontFamily: 'IBM Plex Mono', fontSize: 9, textAlign: 'right', color: INK.secondary },

  totals: { marginTop: 10, alignSelf: 'flex-end', width: 268 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalLabel: { fontSize: 9, color: INK.secondary },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 7,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: INK.lineStrong,
  },
  grandLabel: { fontSize: 10, fontWeight: 600 },
  grandValue: { fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 500, textAlign: 'right' },

  section: { marginTop: 22 },
  sectionTitle: { fontSize: 10, fontWeight: 600, marginBottom: 7 },

  note: {
    marginTop: 8,
    padding: 8,
    backgroundColor: INK.inset,
    borderLeftWidth: 2,
    borderLeftColor: INK.lineStrong,
    fontSize: 8,
    color: INK.secondary,
    lineHeight: 1.5,
  },

  footer: {
    position: 'absolute',
    bottom: 26,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: INK.lineSubtle,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: INK.muted },
  footerPage: { fontFamily: 'IBM Plex Mono', fontSize: 7, color: INK.muted },
});

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Splits on LF and on CRLF: a browser textarea submits CRLF, and that is what
 * the settings row actually holds.
 */
const NEWLINE = /\r?\n/;

/**
 * One `<Text>` per line, never a newline inside one.
 *
 * A newline inside a single Text makes @react-pdf/renderer emit that run in
 * **Helvetica** — an unembedded fallback, in a document where every other glyph
 * is IBM Plex. Bisected: an address of "14 Admiralty Way" is clean, and the
 * same address with a second line drags `/BaseFont /Helvetica` into the font
 * table and a `/F1 8 Tf` selection into the content stream.
 *
 * It is the ordinary case, not an edge: the settings form gives the address a
 * textarea and promises the line breaks are kept. Splitting here honours that
 * promise and keeps the typeface.
 *
 * Handles CRLF as well as LF, because a browser textarea submits CRLF and that
 * is what the settings row actually holds.
 */
function Lines({ text, style }: { text: string; style?: Style }) {
  const lines = text.split(NEWLINE).map((l) => l.trimEnd()).filter((l) => l !== '');
  return (
    <>
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} style={style}>
          {line}
        </Text>
      ))}
    </>
  );
}

/** Money, at the edge. Everything upstream is bigint minor units. */
function Money({
  minor,
  currency,
  style,
}: {
  minor: bigint;
  currency: string;
  style?: Style;
}) {
  return (
    <Text style={[styles.money, style ?? {}]}>
      {currencySymbol(currency)}
      {formatMinorDigits(minor, currency)}
    </Text>
  );
}

/**
 * §3.4 badge construction, and §3.3's rule that the marker travels with the
 * colour — load-bearing here rather than decorative, because the tints are
 * indistinguishable in greyscale.
 */
function Marker({ shape, color }: { shape: MarkerShape; color: string }) {
  if (typeof shape === 'object') {
    return <Text style={[styles.badgeMarker, { color }]}>{shape.glyph}</Text>;
  }

  // A 10x10 viewBox drawn at 5.5pt, which matches the optical weight of the
  // 7pt label beside it.
  return (
    <Svg width={5.5} height={5.5} viewBox="0 0 10 10" style={{ marginRight: 3 }}>
      {shape === 'filled' ? <Circle cx={5} cy={5} r={4.4} fill={color} /> : null}
      {shape === 'open' ? (
        <Circle cx={5} cy={5} r={3.7} fill="none" stroke={color} strokeWidth={1.5} />
      ) : null}
      {shape === 'half' ? (
        <>
          <Circle cx={5} cy={5} r={4.4} fill="none" stroke={color} strokeWidth={1.3} />
          <Path d="M5 0.6 A 4.4 4.4 0 0 0 5 9.4 Z" fill={color} />
        </>
      ) : null}
      {shape === 'triangle' ? <Path d="M5 0.8 L9.6 9.2 L0.4 9.2 Z" fill={color} /> : null}
    </Svg>
  );
}

function StatusBadge({ status }: { status: EffectiveStatus }) {
  // One mapping, shared with the screens — see the note on STATUS_PRINT.
  const { key, label } = invoiceStatusKey(status);
  const s = STATUS_PRINT[key];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.border, borderLeftColor: s.fg }]}>
      <Marker shape={s.marker} color={s.fg} />
      <Text style={[styles.badgeLabel, { color: s.fg }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function LineItemsTable({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Items</Text>

      {/*
        `fixed` repeats this row at the top of every page the table spans, which
        is what stops page two being a wall of unlabelled numbers.
      */}
      <View style={styles.tableHead} fixed>
        <Text style={[styles.headCell, { width: COL.position }]}>#</Text>
        <Text style={[styles.headCell, { width: COL.description }]}>DESCRIPTION</Text>
        <Text style={[styles.headCell, { width: COL.quantity, textAlign: 'right' }]}>QTY</Text>
        <Text style={[styles.headCell, { width: COL.unit, textAlign: 'right' }]}>UNIT</Text>
        <Text style={[styles.headCell, { width: COL.amount, textAlign: 'right' }]}>AMOUNT</Text>
      </View>

      {invoice.lineItems.map((line) => (
        // A single line never splits across a page boundary: half a description
        // at the foot of one page is worse than a slightly short page.
        <View key={line.id} style={styles.row} wrap={false}>
          <Text style={[styles.cell, { width: COL.position, color: INK.muted }]}>
            {line.position}
          </Text>
          <View style={{ width: COL.description }}>
            <Lines text={line.description} style={styles.cell} />
          </View>
          <Text style={[styles.money, { width: COL.quantity, color: INK.secondary }]}>
            {formatQuantityDisplay(line.quantity)}
          </Text>
          <Text style={[styles.moneyMuted, { width: COL.unit }]}>
            {currencySymbol(invoice.currency)}
            {formatMinorDigits(line.unitAmountMinor, invoice.currency)}
          </Text>
          <Text style={[styles.money, { width: COL.amount }]}>
            {currencySymbol(invoice.currency)}
            {formatMinorDigits(line.lineAmountMinor, invoice.currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * The pre-itemisation case, carrying the same refusal to invent a breakdown
 * that the detail page makes.
 *
 * An empty five-column table under an "Items" heading would read as an invoice
 * for nothing. A reconstructed single line reading "Website work — ₦1,850,000"
 * would be a guess printed onto a document that has already been sent. Saying
 * what the record actually is costs one sentence and is true.
 */
function Unitemised({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Details</Text>
      <Lines
        text={invoice.description ?? 'No description was recorded for this invoice.'}
        style={{ fontSize: 9, lineHeight: 1.55, color: INK.primary }}
      />
      <Text style={styles.note}>
        This invoice predates per-line itemisation. The total below is the figure
        it was issued for; no breakdown was recorded at the time and one has not
        been reconstructed.
      </Text>
    </View>
  );
}

function Totals({ invoice, succeeded }: { invoice: InvoiceDetail; succeeded: InvoiceDetail['payments'] }) {
  const received = succeeded.reduce((sum, p) => sum + p.amountMinor, 0n);
  const balance = invoice.amountMinor - received;

  return (
    <View style={styles.totals}>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Invoice total</Text>
        <Money minor={invoice.amountMinor} currency={invoice.currency} />
      </View>

      {received > 0n ? (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            Received ({succeeded.length} {succeeded.length === 1 ? 'payment' : 'payments'})
          </Text>
          <Text style={styles.moneyMuted}>
            −{currencySymbol(invoice.currency)}
            {formatMinorDigits(received, invoice.currency)}
          </Text>
        </View>
      ) : null}

      <View style={styles.grandRow}>
        <Text style={styles.grandLabel}>{balance > 0n ? 'Balance due' : 'Balance'}</Text>
        <Text
          style={[
            styles.grandValue,
            balance <= 0n ? { color: STATUS_PRINT.paid.fg } : {},
          ]}
        >
          {currencySymbol(invoice.currency)}
          {formatMinorDigits(balance < 0n ? -balance : balance, invoice.currency)}
          {balance < 0n ? ' over' : ''}
        </Text>
      </View>
    </View>
  );
}

function PaymentsReceived({
  invoice,
  succeeded,
}: {
  invoice: InvoiceDetail;
  succeeded: InvoiceDetail['payments'];
}) {
  if (succeeded.length === 0) return null;

  return (
    <View style={styles.section} minPresenceAhead={60}>
      <Text style={styles.sectionTitle}>Payments received</Text>
      <View style={[styles.tableHead, { borderBottomColor: INK.lineDefault }]}>
        <Text style={[styles.headCell, { width: 110 }]}>DATE</Text>
        <Text style={[styles.headCell, { width: 220 }]}>METHOD</Text>
        <Text style={[styles.headCell, { width: 144, textAlign: 'right' }]}>AMOUNT</Text>
      </View>
      {succeeded.map((payment) => (
        <View key={payment.id} style={styles.row} wrap={false}>
          <Text style={[styles.factValue, { width: 110 }]}>
            {formatDateFull(payment.occurredAt)}
          </Text>
          <Text style={[styles.cell, { width: 220, color: INK.secondary }]}>
            {payment.method ?? payment.provider}
          </Text>
          <Text style={[styles.money, { width: 144 }]}>
            {currencySymbol(invoice.currency)}
            {formatMinorDigits(payment.amountMinor, invoice.currency)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* The document                                                               */
/* -------------------------------------------------------------------------- */

export function InvoiceDocument({
  invoice,
  settings,
}: {
  invoice: InvoiceDetail;
  settings: Settings;
}): React.ReactElement<DocumentProps> {
  /*
   * Registered here, not in `renderInvoicePdf`.
   *
   * It lived in the entry point first, which meant any caller that used the
   * component directly — the dev sample route did, and so did the verification
   * harness — got "Font family not registered: IBM Plex Sans" or, worse, a
   * silent Helvetica fallback. Font registration is a property of the document,
   * so it belongs with the document. The call is idempotent.
   */
  registerFonts();

  /*
   * Only succeeded payments reduce the balance — the same rule
   * `invoice-status.ts` applies everywhere else, and the reason a refund is its
   * own row rather than a subtraction.
   *
   * Failed and pending attempts are deliberately NOT listed. On the detail page
   * they are evidence for why a balance did not move; on a document sent to the
   * client they are a list of that client's declined cards, which is both
   * embarrassing and irrelevant to what they now owe.
   */
  const succeeded = invoice.payments.filter((p) => p.status === 'succeeded');

  // Split here, not in the JSX: the address is the multi-line one, and a
  // newline inside a single Text costs the typeface. See `Lines`.
  const businessLines = [
    ...settings.businessAddress.split(NEWLINE),
    settings.businessEmail,
    settings.businessPhone,
  ]
    .map((v) => v.trim())
    .filter((v) => v !== '');

  const clientLines = [invoice.client.email].filter((v): v is string => Boolean(v));

  return (
    <Document
      title={`${invoice.number} · ${settings.businessName}`}
      author={settings.businessName}
      subject={`Invoice ${invoice.number} for ${invoice.client.name}`}
      creator="Settled"
      producer="Settled"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.masthead} fixed={false}>
          <View style={{ width: 250 }}>
            <Text style={styles.businessName}>{settings.businessName}</Text>
            {businessLines.map((line) => (
              <Text key={line} style={styles.businessLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={{ width: 200 }}>
            <Text style={styles.docLabel}>INVOICE</Text>
            <Text style={styles.docNumber}>{invoice.number}</Text>
            <StatusBadge status={invoice.status} />
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.partyBlock}>
            <Text style={styles.eyebrow}>BILLED TO</Text>
            <Text style={styles.partyName}>{invoice.client.name}</Text>
            {/* Address above the email: a billed-to block is a postal address
                first, and the email is how to reply to it. */}
            {invoice.client.address ? (
              <Lines text={invoice.client.address} style={styles.partyLine} />
            ) : null}
            {clientLines.map((line) => (
              <Text key={line} style={styles.partyLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={[styles.partyBlock, { width: 200 }]}>
            <Text style={styles.eyebrow}>DETAILS</Text>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Issued</Text>
              <Text style={styles.factValue}>
                {invoice.issuedAt ? formatDateFull(invoice.issuedAt) : 'Not issued'}
              </Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>Due</Text>
              <Text style={styles.factValue}>
                {invoice.dueAt ? formatDateFull(invoice.dueAt) : '—'}
              </Text>
            </View>
            {invoice.daysOverdue > 0 ? (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Overdue by</Text>
                <Text style={[styles.factValue, { color: STATUS_PRINT.overdue.fg }]}>
                  {invoice.daysOverdue} {invoice.daysOverdue === 1 ? 'day' : 'days'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {invoice.lineItems.length > 0 ? (
          <LineItemsTable invoice={invoice} />
        ) : (
          <Unitemised invoice={invoice} />
        )}

        {/*
          `minPresenceAhead` reserves space below: if this much room is not left
          on the page, the totals move wholesale to the next one rather than the
          grand total being orphaned under a page break. A balance-due figure
          alone at the top of a page is the one layout failure on an invoice
          that actually costs money to get wrong.
        */}
        <View minPresenceAhead={96} wrap={false}>
          <Totals invoice={invoice} succeeded={succeeded} />
        </View>

        <PaymentsReceived invoice={invoice} succeeded={succeeded} />

        {invoice.base ? (
          <Text style={styles.note}>
            Indicative equivalent: ≈{currencySymbol(invoice.base.currency)}
            {formatMinorDigits(invoice.base.outstandingMinor, invoice.base.currency)} outstanding, at the rate of{' '}
            {invoice.base.rate} recorded on {formatDateFull(invoice.base.fetchedAt)}. This
            invoice is payable in {invoice.currency}; the equivalent is for reference and is
            not the amount due.
          </Text>
        ) : null}

        {/*
          The footer is `fixed`, so it lands on every page. The page numbers
          render only when there is more than one page — a lone "Page 1 of 1" is
          furniture that tells the reader nothing.
        */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {invoice.number} · {settings.businessName}
          </Text>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) =>
              totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : ''
            }
          />
        </View>
      </Page>
    </Document>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`No invoice with id ${id}`);
    this.name = 'InvoiceNotFoundError';
  }
}

/**
 * Renders one invoice to a PDF buffer.
 *
 * Reads the invoice and the settings row together, because the document is a
 * statement about both and reading them at different instants would let the
 * business name change between the masthead and the footer.
 */
export async function renderInvoicePdf(
  invoiceId: string,
  /*
   * Passed through rather than assumed. The email paths render live
   * invoices and pass 'all'; the download route passes whatever its reader
   * is entitled to, so a signed-out visitor cannot fetch a live invoice's
   * PDF by id even though the page that links to it is public.
   */
  scope: ReadScope,
): Promise<Buffer> {
  const [invoice, settings] = await Promise.all([
    getInvoice(invoiceId, scope),
    getSettings(),
  ]);
  if (!invoice) throw new InvoiceNotFoundError(invoiceId);

  /*
   * Called, not mounted as JSX. The renderer is typed to take a `Document`
   * element; `<InvoiceDocument />` is typed by its own props, so JSX here fails
   * to typecheck even though it renders identically. Invoking the function
   * returns the Document element itself, which is what the renderer wants.
   */
  return renderDocumentToBuffer(InvoiceDocument({ invoice, settings }));
}

/** The filename a browser or an email attachment should use. */
export function invoicePdfFilename(invoice: Pick<InvoiceDetail, 'number'>): string {
  return `${invoice.number}.pdf`;
}
