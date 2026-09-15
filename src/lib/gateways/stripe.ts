import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  GatewayAdapter,
  NormalizedEvent,
  NormalizedEventKind,
  SweepPage,
  SweptTransaction,
} from './types';

/* ==========================================================================
   Stripe.
   ==========================================================================

   ## Two credentials, not one

   Stripe is the only gateway here that needs a different secret for each job:

     STRIPE_WEBHOOK_SECRET   whsec_…  verifies webhook signatures
     STRIPE_SECRET_KEY       sk_…     calls the API for reconciliation

   They are not interchangeable and one does not imply the other. A deploy with
   only `STRIPE_SECRET_KEY` can sweep but rejects every webhook; one with only
   the `whsec_` can take webhooks but never reconciles. Both are declared in
   `credentials` below so the settings panel and the registry can tell the
   difference rather than reporting a single "Stripe: configured".

   ## Hand-rolled verification, and why that is defensible here

   Stripe recommends `constructEvent` from their SDK. I have not used it, and
   the reason is not "fewer dependencies" — it is that the SDK's safety comes
   from four specific properties, all of them documented, all of them
   implemented and TESTED below:

     1. v1 only. The docs say "To prevent downgrade attacks, ignore all schemes
        that aren't v1". Stripe sends a deliberately fake `v0` on test events; an
        implementation that accepted any scheme would accept those.
     2. EVERY v1 signature is checked, not just the first. During a secret roll
        the endpoint has two active secrets for up to 24 hours and Stripe sends
        one signature per secret. Checking only the first breaks every roll.
     3. Constant-time comparison, per the docs' explicit instruction.
     4. A timestamp tolerance, because the timestamp is inside the signed
        payload and is what makes a captured request non-replayable.

   Take any one of those away and the SDK is meaningfully safer. With all four,
   it is the same check. `constructEvent` also still requires the raw body, so
   it removes none of the framework-level footguns that actually break Stripe
   integrations.

   The cost avoided is real: the `stripe` package is large, and it would be
   pulled into a serverless bundle for one HMAC and one list call.

   The honest caveat is in the verification report — this is proven against
   payloads I signed myself, which exercises the algorithm but not Stripe's
   real header formatting.
   ========================================================================== */

const SIGNATURE_HEADER = 'stripe-signature';

/**
 * Five minutes, matching the default in Stripe's own libraries.
 *
 * The docs are explicit that zero is not an option: "Don't use a tolerance
 * value of 0. Using a tolerance value of 0 disables the recency check
 * entirely." Too tight is its own failure — a server whose clock has drifted
 * rejects every genuine event — which is why the docs pair this with a note
 * about running NTP.
 */
const TOLERANCE_SECONDS = 300;

const API_BASE = 'https://api.stripe.com/v1';

/**
 * Stripe's list endpoints cap `limit` at 100 and paginate by CURSOR, not page
 * number: pass the last object's id as `starting_after` and read `has_more`.
 *
 * Cursor pagination is why the sweep cannot drift the way a page-numbered one
 * can. With page numbers, a transaction created mid-sweep shifts every later
 * row down and something gets skipped; anchoring on the last id read cannot
 * skip, because the anchor is a position in the data rather than a count.
 */
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const PAGE_DELAY_MS = 200;
const BACKOFF_MS = [2_000, 8_000, 30_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* -------------------------------------------------------------------------- */
/* Amounts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Stripe zero-decimal currencies: `amount` IS the major amount.
 *
 * Per the currencies doc — "1000 to charge 10 USD… 10 to charge 10 JPY". For
 * these, "the charge and the amount are the same, without requiring
 * multiplication".
 *
 * ISK and UGX are deliberately ABSENT from this list even though both are
 * zero-decimal currencies in the real world. Stripe documents them as special
 * cases that "backward compatibility requires you to represent as a two-decimal
 * value, where the decimal amount is always 00" — so over the API they behave
 * exactly like two-decimal currencies and must not be scaled here. Putting them
 * in this set would inflate every ISK payment a hundredfold, which is precisely
 * the class of error this file is trying not to make.
 */
const ZERO_DECIMAL = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
  'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

/**
 * Stripe's amount to OUR minor units.
 *
 * This ledger's convention is "minor = 1/100 of major" everywhere — the schema
 * stores bigint minor units and `formatMinorDigits` divides by 100. Stripe's
 * convention is the ISO minor unit, which for a zero-decimal currency is the
 * major unit itself. Reconciling the two is exactly what an adapter is for:
 * `NormalizedEvent` says these disagreements stop here.
 *
 * So a ¥500 charge arrives as `500` and is stored as `50000`. Without the
 * multiply it would be stored as `500` and displayed as ¥5.00 — a hundredfold
 * error, in the safe-looking direction where both numbers are plausible.
 *
 * Display is handled at the other end rather than here: `formatMinorDigits`
 * takes the currency and renders a zero-decimal amount with no decimal point at
 * all, so ¥500 stores as 50000 and reads back as "500". The two halves of that
 * convention are documented together on `LEDGER_SCALE_DIGITS` in `lib/money.ts`
 * — scale the value on the way in, choose the places on the way out — and the
 * set below is deliberately kept identical to the one there.
 */
function toLedgerMinor(amount: number, currency: string): bigint | null {
  if (!Number.isInteger(amount)) return null;
  const minor = BigInt(amount);
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? minor * 100n : minor;
}

/* -------------------------------------------------------------------------- */
/* Payload shapes                                                             */
/* -------------------------------------------------------------------------- */

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const asString = (v: unknown): string | undefined => {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
};

const EVENT_KINDS: Record<string, NormalizedEventKind> = {
  'payment_intent.succeeded': 'payment.succeeded',
  'payment_intent.payment_failed': 'payment.failed',
  'charge.refunded': 'payment.refunded',
};

/**
 * The object an event is ABOUT, which is not always `data.object`.
 *
 * For a refund it is the refund, not the charge that was refunded. That matters
 * twice over:
 *
 *   - `payments` is unique on (provider, provider_payment_id). Two partial
 *     refunds against one charge are two separate movements of money and need
 *     two rows; keying both on the charge id would make the second collide,
 *     surface as a unique violation, fail its event, retry five times and
 *     dead-letter — over a completely ordinary refund.
 *   - The event id is derived from the same subject (see `extractEventId`), so
 *     the two refunds are two distinct events rather than one swallowed retry.
 *
 * `data.object.refunds.data[0]` is the most recent refund: Stripe returns list
 * sub-objects newest first.
 */
function subjectOf(type: string, object: Record<string, unknown>): {
  id: string;
  amount: number | null;
  currency?: string;
} | null {
  if (type === 'charge.refunded') {
    const refunds = asRecord(object.refunds);
    const list = Array.isArray(refunds?.data) ? (refunds!.data as unknown[]) : [];
    const latest = asRecord(list[0]);
    const refundId = asString(latest?.id);

    if (refundId) {
      return {
        id: refundId,
        amount: typeof latest?.amount === 'number' ? latest.amount : null,
        currency: asString(latest?.currency) ?? asString(object.currency),
      };
    }

    /*
     * No refund sub-object. Fall back to the charge, with `amount_refunded`
     * rather than `amount` — the latter is what was originally charged, and
     * recording a full-value payment for a partial refund would misstate the
     * ledger in the customer's favour and ours simultaneously.
     */
    const id = asString(object.id);
    if (!id) return null;
    return {
      id: `${id}:refund`,
      amount: typeof object.amount_refunded === 'number' ? object.amount_refunded : null,
      currency: asString(object.currency),
    };
  }

  const id = asString(object.id);
  if (!id) return null;
  return {
    id,
    amount: typeof object.amount === 'number' ? object.amount : null,
    currency: asString(object.currency),
  };
}

/** Constant-time hex comparison. Same double guard as the Paystack adapter. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/** `t=…,v1=…,v0=…` into a timestamp and every v1 signature offered. */
function parseSignatureHeader(header: string): { timestamp?: string; v1: string[] } {
  const v1: string[] = [];
  let timestamp: string | undefined;

  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    // v0 is deliberately dropped: Stripe sends a fake one on test events, and
    // the docs say to ignore every scheme that is not v1.
    else if (key === 'v1') v1.push(value.toLowerCase());
  }

  return { timestamp, v1 };
}

/** The customer's email, wherever this event shape happens to keep it. */
function emailFrom(object: Record<string, unknown>): string | undefined {
  const billing = asRecord(object.billing_details);
  const charges = asRecord(object.charges);
  const firstCharge = Array.isArray(charges?.data) ? asRecord((charges!.data as unknown[])[0]) : null;
  const chargeBilling = asRecord(firstCharge?.billing_details);

  return (
    asString(object.receipt_email) ??
    asString(billing?.email) ??
    asString(chargeBilling?.email) ??
    asString(firstCharge?.receipt_email)
  );
}

function invoiceRefFrom(object: Record<string, unknown>): string | undefined {
  const metadata = asRecord(object.metadata);
  if (!metadata) return undefined;
  for (const key of ['invoice_number', 'invoiceNumber', 'invoice_ref', 'invoiceRef', 'invoice']) {
    const value = asString(metadata[key]);
    if (value) return value;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Sweep                                                                      */
/* -------------------------------------------------------------------------- */

type StripeList = { data?: unknown; has_more?: unknown };

async function listPage(
  key: string,
  params: URLSearchParams,
): Promise<StripeList> {
  let attempt = 0;

  for (;;) {
    const response = await fetch(`${API_BASE}/payment_intents?${params.toString()}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 429) {
      if (attempt >= BACKOFF_MS.length) {
        throw new Error('Stripe rate limit: still 429 after three backoffs');
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
      throw new Error(`Stripe list payment_intents failed: HTTP ${response.status} ${detail.slice(0, 200)}`);
    }

    return (await response.json()) as StripeList;
  }
}

async function fetchTransactions(since: Date, until: Date): Promise<SweepPage> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');

  const transactions: SweptTransaction[] = [];
  let requests = 0;
  let seen = 0;
  let startingAfter: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(PAGE_LIMIT),
      'created[gte]': String(Math.floor(since.getTime() / 1000)),
      'created[lte]': String(Math.ceil(until.getTime() / 1000)),
    });
    if (startingAfter) params.set('starting_after', startingAfter);

    const body = await listPage(key, params);
    requests += 1;

    const rows = Array.isArray(body.data) ? body.data : [];
    seen += rows.length;
    if (rows.length === 0) break;

    for (const row of rows) {
      const intent = asRecord(row);
      if (!intent) continue;

      /*
       * A PaymentIntent is not an Event, so the sweep has to decide what event
       * this WOULD have been. Only terminal outcomes are swept; the statuses a
       * PaymentIntent passes through on the way (`requires_payment_method`,
       * `processing`, `requires_action`) are not payments and writing rows for
       * them would fill the ledger with abandoned checkouts.
       */
      const status = asString(intent.status);
      const type =
        status === 'succeeded'
          ? 'payment_intent.succeeded'
          : status === 'canceled'
            ? undefined
            : undefined;
      if (!type) continue;

      // Webhook shape, so the drain re-normalises from an Event exactly as it
      // would for a real delivery.
      const payload = {
        object: 'event',
        type,
        livemode: intent.livemode === true,
        data: { object: intent },
      } as Record<string, unknown>;

      const event = stripeAdapter.normalize(payload);
      if (event) transactions.push({ event, payload });
    }

    if (body.has_more !== true) break;
    startingAfter = asString(asRecord(rows[rows.length - 1])?.id);
    if (!startingAfter) break;
    await sleep(PAGE_DELAY_MS);
  }

  return { transactions, requests, seen };
}

/* -------------------------------------------------------------------------- */

export const stripeAdapter: GatewayAdapter = {
  id: 'stripe',

  credentials: {
    webhook: ['STRIPE_WEBHOOK_SECRET'],
    api: ['STRIPE_SECRET_KEY'],
  },

  verify(rawBody, headers) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    // Fail closed: an unconfigured environment rejects every webhook.
    if (!secret) return false;

    const header = headers.get(SIGNATURE_HEADER)?.trim();
    if (!header) return false;

    const { timestamp, v1 } = parseSignatureHeader(header);
    if (!timestamp || v1.length === 0) return false;

    const sent = Number(timestamp);
    if (!Number.isFinite(sent)) return false;

    /*
     * Replay window. The timestamp is inside the signed payload, so an attacker
     * cannot move it without invalidating the signature — which is what makes
     * this check meaningful rather than decorative.
     *
     * Absolute difference, not "older than": a request stamped far in the FUTURE
     * is equally suspect, and on a machine whose clock is behind, accepting
     * unbounded future timestamps would quietly widen the window to forever.
     */
    const skew = Math.abs(Math.floor(Date.now() / 1000) - sent);
    if (skew > TOLERANCE_SECONDS) return false;

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');

    // Every offered v1, so a secret roll does not break verification. No early
    // return on the first match: the comparison itself is constant-time and
    // there is no secret in which signature matched.
    let matched = false;
    for (const candidate of v1) {
      if (timingSafeEqualHex(expected, candidate)) matched = true;
    }
    return matched;
  },

  /**
   * `${type}:${subject id}` — deliberately NOT Stripe's own `evt_…`.
   *
   * Stripe does ship a real event id, and using it would be the obvious choice.
   * It is the wrong one here, because of reconciliation: the sweep lists
   * PaymentIntents, and a PaymentIntent does not know the id of the event that
   * announced it. Keying on `evt_…` would mean a swept transaction and its
   * webhook carry different ids, both rows process, and the second dies on the
   * payments unique constraint — the exact failure the reconciliation design
   * exists to avoid.
   *
   * The subject id is derivable from both paths and is just as stable: Stripe
   * retries carry the same object, and a type prefix keeps a refund distinct
   * from the charge it refunds. `subjectOf` keys a refund on the REFUND id, so
   * two partial refunds against one charge stay two events rather than one.
   */
  extractEventId(payload) {
    const root = asRecord(payload);
    const type = asString(root?.type) ?? 'unknown';
    const object = asRecord(asRecord(root?.data)?.object);

    const subject = object ? subjectOf(type, object) : null;
    if (subject) return `${type}:${subject.id}`;

    // Last resort only: Stripe's event id, which at least dedupes retries.
    const eventId = asString(root?.id);
    return eventId ? `${type}:${eventId}` : `${type}:unknown`;
  },

  normalize(payload) {
    const root = asRecord(payload);
    if (!root) return null;

    const type = asString(root.type);
    if (!type) return null;

    const kind = EVENT_KINDS[type];
    if (!kind) return null; // Known event, no behaviour for it. Not an error.

    const object = asRecord(asRecord(root.data)?.object);
    if (!object) return null;

    const subject = subjectOf(type, object);
    if (!subject || subject.amount === null) return null;

    const currency = (subject.currency ?? asString(object.currency))?.toUpperCase();
    if (!currency) return null;

    const amountMinor = toLedgerMinor(subject.amount, currency);
    if (amountMinor === null) return null;

    /*
     * `livemode` is a TOP-LEVEL BOOLEAN on the Stripe Event — a direct read, not
     * a string comparison against "test" the way Paystack's `data.domain` is.
     *
     * The EVENT's flag wins over the nested object's. They agree in practice,
     * but the event-level one is the field Stripe documents and the one that
     * describes the delivery; preferring the inner copy made a payload whose
     * object omitted it fall through to the root anyway, which is the same
     * answer by a longer route and the opposite precedence to the one intended.
     *
     * The contract's conservative default still applies at the end: anything not
     * exactly `false` is live, so a payload carrying neither flag is never
     * mistaken for test data and swept into the demo purge.
     */
    const liveFlag = root.livemode !== undefined ? root.livemode : object.livemode;
    const livemode = liveFlag !== false;

    const created =
      typeof object.created === 'number'
        ? new Date(object.created * 1000)
        : typeof root.created === 'number'
          ? new Date(root.created * 1000)
          : new Date();

    const customer = asRecord(object.customer);
    const billing = asRecord(object.billing_details);

    return {
      providerEventId: `${type}:${subject.id}`,
      kind,
      providerPaymentId: subject.id,
      amountMinor,
      currency,
      occurredAt: created,
      livemode,
      customer: {
        name: asString(billing?.name) ?? asString(customer?.name),
        email: emailFrom(object),
        providerId: asString(object.customer) ?? asString(customer?.id),
      },
      invoiceRef: invoiceRefFrom(object),
      method: asString(object.payment_method_types ? undefined : object.payment_method_type) ?? 'card',
    } satisfies NormalizedEvent;
  },

  fetchTransactions,
};
