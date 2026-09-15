import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { parseDecimalToMinor } from '@/lib/money';

import type {
  GatewayAdapter,
  NormalizedEvent,
  NormalizedEventKind,
  SweepPage,
  SweptTransaction,
} from './types';

/* ==========================================================================
   Flutterwave.
   ==========================================================================

   Two things make this adapter different from the other two, and both are
   traps rather than preferences.

   ## 1. Verification is a shared secret, not a signature

   Flutterwave sends the value of `FLUTTERWAVE_VERIF_HASH` back in a `verif-hash`
   header and asks you to compare it to what you configured. That is
   authentication by bearer token, not a signature, and it is strictly weaker
   than Paystack's HMAC-SHA512 or Stripe's HMAC-SHA256:

     - It does not bind to the BODY. An HMAC proves this exact payload came from
       the sender; a shared secret proves only that whoever sent it knows the
       secret. A proxy that could alter a payload in flight could change the
       amount and the header would still match.
     - It does not bind to TIME. Stripe's timestamp is inside its signed payload,
       so a captured request goes stale. This header does not expire, so **a
       single captured request is replayable forever** — and it carries the
       secret itself, so anyone who sees one request can forge every future one.
     - The risk is conditional on TLS holding end to end. That is usually true
       and occasionally not: a corporate TLS-terminating proxy, a misconfigured
       load balancer that logs headers, an APM agent capturing request headers,
       a CDN in front of the origin. Any of those turns one logged request into
       a permanent forgery capability.

   What that means in practice: our dedupe is doing more work here than it is
   for the other two. A replayed request produces the same `provider_event_id`,
   so `onConflictDoNothing` collapses it and no second payment appears. That is
   a genuine mitigation for replay, and it is NOT a mitigation for forgery — an
   attacker with the secret can mint new transaction ids at will. The real
   controls are keeping the hash out of logs, rotating it, and IP-allowlisting
   Flutterwave's senders at the edge.

   The comparison below is still constant-time. It buys little against an
   attacker who can replay, but it costs nothing and the alternative is a
   timing oracle on the one secret that IS the authentication.

   ## 2. Amounts are MAJOR units

   `"amount": 100, "currency": "NGN"` in their charge.completed sample means one
   hundred naira, not one naira. Paystack and Stripe both send minor units; this
   one does not. Reading it as minor units understates every payment a
   hundredfold, reading it as major without converting overstates it the same
   way, and both wrong numbers look entirely plausible next to a real invoice.

   The value can also carry decimals (`100.5`), which is why the conversion goes
   through `parseDecimalToMinor` — string arithmetic, no `Number` — rather than
   `amount * 100`. `parseFloat('0.07') * 100` is 7.000000001, and `Math.round`
   hides that right up until the invoice it does not.
   ========================================================================== */

const VERIF_HEADER = 'verif-hash';

const API_BASE = 'https://api.flutterwave.com/v3';

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const PAGE_DELAY_MS = 250;
const BACKOFF_MS = [2_000, 8_000, 30_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const asString = (v: unknown): string | undefined => {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
};

/**
 * Flutterwave's status, not its event name, decides the kind.
 *
 * Both a successful and a failed charge arrive as `charge.completed`; only
 * `data.status` separates them. Branching on the event name alone — which is
 * what the other two adapters do — would file every failed card attempt as a
 * successful payment, mark invoices paid, and send receipts for money that
 * never arrived.
 */
const STATUS_KINDS: Record<string, NormalizedEventKind> = {
  successful: 'payment.succeeded',
  failed: 'payment.failed',
  error: 'payment.failed',
};

/** The events we act on at all. Anything else normalises to null. */
const HANDLED_EVENTS = new Set(['charge.completed']);

/**
 * Constant-time comparison of two secrets of unknown, possibly differing
 * length.
 *
 * Hashed first rather than compared directly, because `timingSafeEqual` throws
 * on length mismatch and a plain length check leaks the secret's length. SHA-256
 * of each side gives two fixed-width buffers, so the comparison is total and
 * reveals nothing.
 */
function timingSafeEqualSecret(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * Major units to our minor units, exactly.
 *
 * `String(amount)` is safe for the round trip: JS prints the shortest decimal
 * that reparses to the same double, so `100.5` renders `"100.5"`. An amount with
 * more precision than the currency allows is REJECTED (`too-precise`) rather
 * than rounded — picking one of two neighbouring kobo on someone's behalf is
 * how a total ends up one off the sum of its lines.
 */
function majorToMinor(amount: unknown, currency: string): bigint | null {
  const raw =
    typeof amount === 'number' && Number.isFinite(amount)
      ? String(amount)
      : typeof amount === 'string'
        ? amount
        : null;
  if (raw === null) return null;

  const parsed = parseDecimalToMinor(raw, currency);
  return parsed.ok ? parsed.minor : null;
}

function invoiceRefFrom(data: Record<string, unknown>): string | undefined {
  const meta = asRecord(data.meta) ?? asRecord(data.metadata);
  if (!meta) return undefined;
  for (const key of ['invoice_number', 'invoiceNumber', 'invoice_ref', 'invoiceRef', 'invoice']) {
    const value = asString(meta[key]);
    if (value) return value;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Sweep                                                                      */
/* -------------------------------------------------------------------------- */

type FlwListResponse = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
  meta?: { page_info?: { total?: unknown; current_page?: unknown; total_pages?: unknown } };
};

async function listPage(key: string, params: URLSearchParams): Promise<FlwListResponse> {
  let attempt = 0;

  for (;;) {
    const response = await fetch(`${API_BASE}/transactions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 429) {
      if (attempt >= BACKOFF_MS.length) {
        throw new Error('Flutterwave rate limit: still 429 after three backoffs');
      }
      const header = response.headers.get('retry-after');
      const retryAfter = header ? Number(header) : NaN;
      await sleep(
        Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 60_000) : BACKOFF_MS[attempt]!,
      );
      attempt += 1;
      continue;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Flutterwave list transactions failed: HTTP ${response.status} ${detail.slice(0, 200)}`,
      );
    }

    const body = (await response.json()) as FlwListResponse;
    if (body.status !== 'success') {
      throw new Error(
        `Flutterwave list transactions refused: ${String(body.message ?? 'no message')}`,
      );
    }
    return body;
  }
}

async function fetchTransactions(since: Date, until: Date): Promise<SweepPage> {
  const key = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY is not set');

  const transactions: SweptTransaction[] = [];
  const seenIds = new Set<string>();
  let requests = 0;
  let seen = 0;
  let page = 1;

  /*
   * `from`/`to` are dates, not timestamps, in Flutterwave's transactions query.
   * Widening to whole days rather than narrowing is the safe direction: a sweep
   * that returns a few transactions outside the window costs one existence
   * check each, whereas one that clips the boundary misses real payments.
   */
  const day = (d: Date) => d.toISOString().slice(0, 10);

  for (; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      from: day(since),
      to: day(until),
      page: String(page),
      limit: String(PAGE_LIMIT),
    });

    const body = await listPage(key, params);
    requests += 1;

    const rows = Array.isArray(body.data) ? body.data : [];
    seen += rows.length;
    if (rows.length === 0) break;

    for (const row of rows) {
      const data = asRecord(row);
      if (!data) continue;

      const status = asString(data.status)?.toLowerCase();
      if (!status || !STATUS_KINDS[status]) continue;

      const payload = { event: 'charge.completed', data } as Record<string, unknown>;
      const event = flutterwaveAdapter.normalize(payload);
      if (!event) continue;

      if (seenIds.has(event.providerEventId)) continue;
      seenIds.add(event.providerEventId);
      transactions.push({ event, payload });
    }

    const totalPages = Number(body.meta?.page_info?.total_pages ?? 1);
    if (!Number.isFinite(totalPages) || page >= totalPages) break;
    await sleep(PAGE_DELAY_MS);
  }

  return { transactions, requests, seen };
}

/* -------------------------------------------------------------------------- */

export const flutterwaveAdapter: GatewayAdapter = {
  id: 'flutterwave',

  credentials: {
    webhook: ['FLUTTERWAVE_VERIF_HASH'],
    api: ['FLUTTERWAVE_SECRET_KEY'],
  },

  verify(_rawBody, headers) {
    const expected = process.env.FLUTTERWAVE_VERIF_HASH;
    // Fail closed, and reject an empty-string env var: a deploy that "has" the
    // variable set to "" would otherwise accept any request that also sends "".
    if (!expected || expected.trim() === '') return false;

    const provided = headers.get(VERIF_HEADER);
    if (!provided) return false;

    /*
     * The raw body is unused here, and that IS the weakness — see the header.
     * The parameter stays in the signature because it is part of the adapter
     * contract, and because the day Flutterwave ships a real signature this is
     * where it plugs in.
     */
    return timingSafeEqualSecret(expected.trim(), provided.trim());
  },

  /**
   * `${event}:${data.id}` — Flutterwave's own transaction id.
   *
   * The same construction as Paystack, for the same reasons: stable across
   * retries of one event, distinct between different events, and derivable from
   * the list endpoint so a reconciliation sweep produces the identical id and
   * is collapsed by the unique constraint rather than processed twice.
   *
   * Success and failure share the `charge.completed` name, but a transaction
   * reaches exactly one terminal status, so the pair never collides. Falls back
   * to `tx_ref` (the merchant reference), then to a digest of the raw bytes.
   */
  extractEventId(payload, rawBody) {
    const root = asRecord(payload);
    const event = asString(root?.event) ?? 'unknown';
    const data = asRecord(root?.data);

    const id = asString(data?.id) ?? asString(data?.tx_ref);
    if (id) return `${event}:${id}`;

    const digest = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    return `${event}:sha256:${digest}`;
  },

  normalize(payload) {
    const root = asRecord(payload);
    if (!root) return null;

    /*
     * A swept row has no `event` wrapper of its own when it comes straight off
     * the list endpoint, so treat a bare transaction as charge.completed. The
     * sweep already wraps it, but accepting both shapes means `normalize` is
     * total over everything this adapter can produce.
     */
    const eventName = asString(root.event) ?? 'charge.completed';
    if (!HANDLED_EVENTS.has(eventName)) return null;

    const data = asRecord(root.data) ?? root;
    if (!data) return null;

    const status = asString(data.status)?.toLowerCase();
    const kind = status ? STATUS_KINDS[status] : undefined;
    if (!kind) return null;

    const providerPaymentId = asString(data.id) ?? asString(data.tx_ref) ?? asString(data.flw_ref);
    if (!providerPaymentId) return null;

    const currency = asString(data.currency)?.toUpperCase();
    if (!currency) return null;

    // MAJOR units. See the header — this multiply is the whole ballgame.
    const amountMinor = majorToMinor(data.amount, currency);
    if (amountMinor === null) return null;

    const occurredRaw =
      asString(data.created_at) ?? asString(data.createdAt) ?? asString(data.charged_at);
    const parsed = occurredRaw ? new Date(occurredRaw) : null;
    const occurredAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

    const customer = asRecord(data.customer);

    /*
     * Flutterwave does not ship a boolean live flag on the charge payload. The
     * contract's rule applies: default to live when there is no indicator,
     * because mistaking a live payment for a test one hands it to the demo purge
     * that deletes real money records, while the reverse leaves junk to tidy.
     *
     * A test-mode key produces test transactions, so an install running against
     * test credentials will see them recorded as live. That is the deliberate,
     * recoverable direction of the error.
     */
    const livemode = true;

    return {
      providerEventId: `${eventName}:${providerPaymentId}`,
      kind,
      providerPaymentId,
      amountMinor,
      currency,
      occurredAt,
      livemode,
      customer: {
        name: asString(customer?.name),
        email: asString(customer?.email),
        providerId: asString(customer?.id),
      },
      invoiceRef: invoiceRefFrom(data),
      method: asString(data.payment_type) ?? asString(data.auth_model),
    } satisfies NormalizedEvent;
  },

  fetchTransactions,
};
