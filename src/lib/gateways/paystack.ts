import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type {
  GatewayAdapter,
  NormalizedEvent,
  NormalizedEventKind,
  SweepPage,
  SweptTransaction,
} from './types';

const SIGNATURE_HEADER = 'x-paystack-signature';

/**
 * HMAC-SHA512, keyed with the secret key, over the raw request body.
 *
 * SHA-512, not the SHA-256 most providers use — this is the single most
 * commonly mis-implemented detail of a Paystack integration.
 * https://paystack.com/docs/payments/webhooks/
 */
const SIGNATURE_ALGORITHM = 'sha512';

/** Hex SHA-512 is 128 characters. Used as a cheap pre-check before hashing. */
const SIGNATURE_HEX_LENGTH = 128;

/* -------------------------------------------------------------------------- */
/* Payload shapes                                                             */
/* -------------------------------------------------------------------------- */

type PaystackAuthorization = {
  channel?: unknown;
  brand?: unknown;
  bank?: unknown;
};

type PaystackCustomer = {
  id?: unknown;
  customer_code?: unknown;
  email?: unknown;
  first_name?: unknown;
  last_name?: unknown;
};

type PaystackCustomField = {
  variable_name?: unknown;
  value?: unknown;
};

type PaystackData = {
  id?: unknown;
  domain?: unknown;
  reference?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  channel?: unknown;
  paid_at?: unknown;
  paidAt?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  customer?: PaystackCustomer;
  authorization?: PaystackAuthorization;
  metadata?: unknown;
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

const asString = (v: unknown): string | undefined => {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
};

/* -------------------------------------------------------------------------- */
/* Event mapping                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Paystack event types we act on. Everything absent from this map normalises to
 * `null` and is stored-but-ignored, which is deliberate: subscription,
 * transfer, customer and dispute events are all real events we simply have no
 * behaviour for yet. Recording them means the drain can be taught about one
 * later without asking Paystack to replay history.
 */
const EVENT_KINDS: Record<string, NormalizedEventKind> = {
  'charge.success': 'payment.succeeded',
  'charge.failed': 'payment.failed',
  'charge.pending': 'payment.pending',
  'refund.processed': 'payment.refunded',
  'refund.failed': 'payment.failed',
};

/* -------------------------------------------------------------------------- */
/* Adapter                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Constant-time comparison of two hex digests.
 *
 * The same double guard as `timingSafeEqualHex` in the session layer, and for
 * the same reasons: `timingSafeEqual` throws on length-mismatched buffers, and
 * `Buffer.from(s, 'hex')` stops silently at the first non-hex character, so two
 * 128-character strings can decode to different byte lengths and still reach
 * the comparison. Both checks are required.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;

  return timingSafeEqual(bufA, bufB);
}

/**
 * Invoice reference, from metadata ONLY.
 *
 * `data.reference` is deliberately not consulted. It is Paystack's identifier
 * for the *transaction*, not for an invoice, and treating it as one is
 * actively dangerous rather than merely useless: many integrations derive the
 * reference from an order or invoice id, so a reference that collides with a
 * real invoice number would link the payment to an unrelated invoice and
 * `refreshInvoiceStatus` would then mark that invoice paid or partial. Wrong,
 * silent, and it moves money in the books.
 *
 * A merchant who wants a payment matched puts the invoice number in
 * `metadata`, either as a key or through Paystack's `custom_fields` convention
 * (`{ display_name, variable_name, value }`). Anything else returns undefined,
 * and the payment lands in the unmatched queue where a human decides — which
 * is exactly what that queue is for.
 */
const INVOICE_METADATA_KEYS = [
  'invoice_number',
  'invoiceNumber',
  'invoice_ref',
  'invoiceRef',
  'invoice',
];

function extractInvoiceRef(data: PaystackData): string | undefined {
  const metadata = asRecord(data.metadata);
  if (!metadata) return undefined;

  for (const key of INVOICE_METADATA_KEYS) {
    const value = asString(metadata[key]);
    if (value) return value;
  }

  // Paystack's checkout puts merchant-defined fields here rather than at the
  // top level of metadata.
  const custom = metadata.custom_fields;
  if (Array.isArray(custom)) {
    for (const entry of custom as PaystackCustomField[]) {
      const name = asString(entry?.variable_name)?.toLowerCase();
      if (!name) continue;
      const matches = INVOICE_METADATA_KEYS.some(
        (key) => key.toLowerCase() === name,
      );
      if (matches) {
        const value = asString(entry?.value);
        if (value) return value;
      }
    }
  }

  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Reconciliation sweep                                                       */
/* -------------------------------------------------------------------------- */

const API_BASE = 'https://api.paystack.co';

/*
 * Paystack's pagination and rate limits, MEASURED rather than assumed.
 *
 * Their docs describe the failure ("Sending multiple requests at short
 * intervals would lead to a 429 (Too many requests) error") and advise waiting
 * "a few minutes" before retrying, but they publish no number. So these come
 * from the live API on 2026-09-14:
 *
 *   x-ratelimit-limit: 1000        sent on every response
 *   x-ratelimit-remaining: 999     decrements per request
 *
 * The budget is read off each response rather than hardcoded, because a limit
 * we invented would go stale silently and a limit we read cannot.
 *
 * `perPage` is CLAMPED TO 100, and silently: asking for 200 or 1000 returns
 * `meta.perPage: 100` with a 200 status and no warning. That matters more than
 * it looks. A caller that asked for 1000 and then paged by its own requested
 * size would compute one page where there were ten, skip 90% of the window, and
 * report success — a reconciliation that proves there was no gap by not looking.
 * Page count therefore comes from `meta.pageCount`, the server's own answer, and
 * never from arithmetic on a number we chose.
 */
const MAX_PER_PAGE = 100;

/** Stop rather than loop forever if `pageCount` is absurd or keeps growing. */
const MAX_PAGES = 100;

/** Leave the integration headroom; a sweep is never the urgent caller. */
const RESERVE_REQUESTS = 50;

/** Pause between pages. Deliberately unhurried — nightly work, not interactive. */
const PAGE_DELAY_MS = 250;

/** 429 backoff when the response carries no Retry-After, in ms. */
const BACKOFF_MS = [2_000, 8_000, 30_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type PaystackListMeta = {
  total?: unknown;
  page?: unknown;
  pageCount?: unknown;
  perPage?: unknown;
};

type PaystackListResponse = {
  status?: unknown;
  message?: unknown;
  data?: unknown;
  meta?: PaystackListMeta;
};

const asInt = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Paystack transaction status to the webhook event name it would have arrived
 * as.
 *
 * This mapping is what lets a swept row rejoin the webhook path: the synthesised
 * payload is `{ event, data }`, the same shape the webhook posts, so `normalize`
 * and `extractEventId` run on it unmodified.
 *
 * Only terminal money outcomes are swept. `abandoned`, `ongoing`, `pending`,
 * `queued` and `processing` are states a transaction passes THROUGH, and
 * sweeping them would write payment rows for checkouts a customer walked away
 * from. `reversed` is deliberately absent too: Paystack's refund webhook carries
 * a refund object with its own shape, and inventing a `refund.processed` body
 * out of a transaction row would push a payload through `normalize` that no real
 * refund resembles.
 */
const STATUS_EVENTS: Record<string, string> = {
  success: 'charge.success',
  failed: 'charge.failed',
};

/**
 * One page of transactions, with 429 handling.
 *
 * Returns the parsed body plus the remaining rate-limit budget, so the caller
 * can slow down before Paystack has to tell it to.
 */
async function fetchPage(
  secret: string,
  params: URLSearchParams,
): Promise<{ body: PaystackListResponse; remaining?: number }> {
  let attempt = 0;

  for (;;) {
    const response = await fetch(`${API_BASE}/transaction?${params.toString()}`, {
      headers: { Authorization: `Bearer ${secret}` },
      // A sweep that hangs holds the whole cron run open.
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 429) {
      if (attempt >= BACKOFF_MS.length) {
        throw new Error('Paystack rate limit: still 429 after three backoffs');
      }
      /*
       * Honour Retry-After when present. Paystack's own advice is to wait "a few
       * minutes", so this ladder ends at 30s and then gives up rather than
       * dressing a tight retry loop up as politeness. Stopping costs nothing:
       * the window is re-swept on the next run, and a 48h window over a nightly
       * schedule means every transaction gets at least two chances.
       */
      const header = response.headers.get('retry-after');
      const retryAfter = header ? Number(header) : NaN;
      const waitMs = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 60_000)
        : BACKOFF_MS[attempt]!;
      attempt += 1;
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Paystack list transactions failed: HTTP ${response.status} ${detail.slice(0, 200)}`,
      );
    }

    const body = (await response.json()) as PaystackListResponse;
    if (body.status !== true) {
      throw new Error(
        `Paystack list transactions refused: ${String(body.message ?? 'no message')}`,
      );
    }

    return { body, remaining: asInt(response.headers.get('x-ratelimit-remaining')) };
  }
}

async function fetchTransactions(since: Date, until: Date): Promise<SweepPage> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');

  const transactions: SweptTransaction[] = [];
  const seenIds = new Set<string>();
  let requests = 0;
  let seen = 0;
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount && page <= MAX_PAGES) {
    const params = new URLSearchParams({
      perPage: String(MAX_PER_PAGE),
      page: String(page),
      from: since.toISOString(),
      to: until.toISOString(),
    });

    const { body, remaining } = await fetchPage(secret, params);
    requests += 1;

    /*
     * `pageCount` is re-read on every page rather than fixed from the first.
     * Transactions keep arriving while a sweep runs, so the total can grow
     * underneath it; trusting the first answer would stop early on exactly the
     * busy night when a gap is most likely.
     */
    pageCount = asInt(body.meta?.pageCount) ?? 1;

    const rows = Array.isArray(body.data) ? body.data : [];
    seen += rows.length;

    for (const row of rows) {
      const data = asRecord(row);
      if (!data) continue;

      const status = asString(data.status)?.toLowerCase();
      const eventName = status ? STATUS_EVENTS[status] : undefined;
      if (!eventName) continue;

      // Shaped exactly like a webhook body, so the row the sweep stores is one
      // the drain already knows how to read.
      const payload = { event: eventName, data } as Record<string, unknown>;

      const event = paystackAdapter.normalize(payload);
      if (!event) continue;

      // A busy window can return the same transaction on two pages if rows
      // shift between requests. Cheap to guard, confusing to debug.
      if (seenIds.has(event.providerEventId)) continue;
      seenIds.add(event.providerEventId);

      transactions.push({ event, payload });
    }

    if (remaining !== undefined && remaining <= RESERVE_REQUESTS) {
      throw new Error(
        `Paystack rate-limit budget nearly spent (${remaining} left); stopped sweep early`,
      );
    }

    page += 1;
    if (page <= pageCount) await sleep(PAGE_DELAY_MS);
  }

  return { transactions, requests, seen };
}

export const paystackAdapter: GatewayAdapter = {
  id: 'paystack',

  /*
   * One key does both jobs here: the same `PAYSTACK_SECRET_KEY` is the HMAC key
   * for webhook verification AND the bearer token for the list endpoint. That
   * is Paystack's design, not a shortcut — which is why the split shape below
   * looks redundant for this adapter and is not for Stripe.
   */
  credentials: {
    webhook: ['PAYSTACK_SECRET_KEY'],
    api: ['PAYSTACK_SECRET_KEY'],
  },

  verify(rawBody, headers) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    // Fail closed. An unconfigured environment must reject every webhook
    // rather than accept every webhook.
    if (!secret) return false;

    const provided = headers.get(SIGNATURE_HEADER)?.trim().toLowerCase();
    if (!provided || provided.length !== SIGNATURE_HEX_LENGTH) return false;

    const expected = createHmac(SIGNATURE_ALGORITHM, secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    return timingSafeEqualHex(expected, provided);
  },

  /**
   * Paystack ships no event id, so this is derived.
   *
   * `${event}:${data.id}` — the event type plus Paystack's own transaction
   * primary key.
   *
   * Why that is the right key:
   *
   * - `data.id` is Paystack's integer primary key for the transaction, unique
   *   within their system and identical across every retry of an event.
   * - Prefixing with the event type keeps two *different* events about the same
   *   transaction distinct. A charge that later gets refunded produces
   *   `charge.success:302961` and `refund.processed:302961`, and both must be
   *   processed. Keying on `data.id` alone would silently discard the refund.
   * - Conversely, the same transaction and the same event type IS the same
   *   event, which is exactly the retry case the unique constraint exists to
   *   collapse.
   * - Cross-provider collisions are impossible: the constraint is on
   *   `(provider, provider_event_id)`, so a Stripe id and a Paystack id never
   *   share a key space.
   *
   * Fallbacks, in order: `data.reference` (the merchant reference, stable per
   * transaction), then a SHA-256 of the raw body. The digest is deterministic
   * for byte-identical retries, which is what Paystack sends — but it would
   * treat a payload whose contents shifted between retries as a new event, so
   * it is a last resort rather than the primary key.
   */
  extractEventId(payload, rawBody) {
    const root = asRecord(payload);
    const event = asString(root?.event) ?? 'unknown';
    const data = asRecord(root?.data);

    const transactionId = asString(data?.id) ?? asString(data?.reference);
    if (transactionId) return `${event}:${transactionId}`;

    const digest = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    return `${event}:sha256:${digest}`;
  },

  normalize(payload) {
    const root = asRecord(payload);
    if (!root) return null;

    const eventName = asString(root.event);
    if (!eventName) return null;

    const kind = EVENT_KINDS[eventName];
    if (!kind) return null; // Known event, no behaviour for it. Not an error.

    const data = asRecord(root.data) as PaystackData | null;
    if (!data) return null;

    const providerPaymentId = asString(data.reference) ?? asString(data.id);
    if (!providerPaymentId) return null;

    /**
     * Paystack amounts are ALREADY in the currency's subunit — kobo for NGN,
     * cents for USD and ZAR, pesewas for GHS, per
     * https://paystack.com/docs/api/transaction/ ("the amount should be in the
     * subunit of the supported currency"; NGN 100 is sent as 10000).
     *
     * So this is a direct assignment to `amountMinor` with NO multiplication.
     * Multiplying by 100 here would inflate every payment a hundredfold, and
     * because both values are plausible integers nothing downstream would
     * notice until a total was reconciled against a bank statement.
     */
    const rawAmount = data.amount;
    if (typeof rawAmount !== 'number' || !Number.isInteger(rawAmount)) return null;
    const amountMinor = BigInt(rawAmount);

    const currency = asString(data.currency)?.toUpperCase();
    if (!currency) return null;

    const occurredAtRaw =
      asString(data.paid_at) ??
      asString(data.paidAt) ??
      asString(data.created_at) ??
      asString(data.createdAt);
    const parsed = occurredAtRaw ? new Date(occurredAtRaw) : null;
    // A webhook with an unparseable timestamp still describes real money; fall
    // back to now rather than dropping it.
    const occurredAt =
      parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

    const customer = asRecord(data.customer) as PaystackCustomer | null;
    const first = asString(customer?.first_name);
    const last = asString(customer?.last_name);
    const name = [first, last].filter(Boolean).join(' ') || undefined;

    const invoiceRef = extractInvoiceRef(data);

    const authorization = asRecord(data.authorization) as PaystackAuthorization | null;
    const method = asString(data.channel) ?? asString(authorization?.channel);

    /**
     * `data.domain` is "test" or "live". Absent means live — see the note on
     * `livemode` in the adapter contract for why the unknown case defaults that
     * way rather than the other.
     */
    const domain = asString(data.domain)?.toLowerCase();
    const livemode = domain !== 'test';

    return {
      providerEventId: `${eventName}:${asString(data.id) ?? providerPaymentId}`,
      kind,
      providerPaymentId,
      amountMinor,
      currency,
      occurredAt,
      livemode,
      customer: {
        name,
        email: asString(customer?.email),
        providerId: asString(customer?.customer_code) ?? asString(customer?.id),
      },
      invoiceRef,
      method,
    } satisfies NormalizedEvent;
  },

  fetchTransactions,
};
