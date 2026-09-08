import type { PaymentProvider, PaymentStatus } from '@/lib/db';

/**
 * The shape every gateway is flattened into before it touches our schema.
 *
 * Providers disagree about almost everything — field names, nesting, whether
 * amounts are major or minor units, whether there is an event id at all. This
 * type is where those disagreements stop. Nothing downstream of an adapter
 * should ever branch on which provider a payment came from.
 */
export type NormalizedEvent = {
  /**
   * Stable per (provider, event). Feeds the `(provider, provider_event_id)`
   * unique constraint, so it must be identical across a provider's retries of
   * the same event and different for genuinely different events.
   */
  providerEventId: string;

  kind: NormalizedEventKind;

  /** The provider's id for the payment itself, not the event. */
  providerPaymentId: string;

  /** Minor units. Never a float, never a major-unit value. */
  amountMinor: bigint;

  /** ISO 4217. */
  currency: string;

  /** When the payment happened, not when we received the webhook. */
  occurredAt: Date;

  /**
   * False for a gateway's test/sandbox mode.
   *
   * Named after Stripe's own field so the contract generalises. Records derived
   * from a test event are written with `isDemo: true`, which puts them inside
   * the nightly demo reset instead of accumulating in the real books forever.
   *
   * Adapters MUST default this to `true` when the payload carries no indicator.
   * The asymmetry is deliberate: mistaking a live payment for a test one hands
   * it to a purge that deletes real money records, while mistaking a test one
   * for live leaves a little junk to tidy up. Only one of those is
   * unrecoverable.
   */
  livemode: boolean;

  customer: {
    name?: string;
    email?: string;
    /** The provider's customer id, for `clients.provider_customer_ids`. */
    providerId?: string;
  };

  /**
   * Whatever the payer typed or the checkout carried that might identify an
   * invoice — a reference, a memo, an invoice number. Matching is the drain's
   * job; the adapter only surfaces the candidate.
   */
  invoiceRef?: string;

  method?: string;
};

export type NormalizedEventKind =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.pending'
  | 'payment.refunded';

/** The one place event kinds become payment statuses. */
export const KIND_TO_PAYMENT_STATUS: Record<NormalizedEventKind, PaymentStatus> = {
  'payment.succeeded': 'succeeded',
  'payment.failed': 'failed',
  'payment.pending': 'pending',
  'payment.refunded': 'refunded',
};

export interface GatewayAdapter {
  id: PaymentProvider;

  /**
   * Constant-time signature check against the **raw** body.
   *
   * Must not throw, and must fail closed: a missing secret, a missing header,
   * or a malformed signature all return false. Returning false is a rejected
   * request; throwing would be a 500, which providers retry against.
   */
  verify(rawBody: string, headers: Headers): boolean;

  /**
   * Derives the deduplication key.
   *
   * Takes the raw body as well as the parsed payload — a deviation from the
   * shape in the brief, and a necessary one. Not every provider ships a stable
   * event id (Paystack does not), so the fallback has to be a digest of the
   * exact bytes received. That is not reconstructible from a parsed object:
   * `JSON.parse` then re-stringify loses key order and whitespace, so two
   * retries of one event could hash differently and defeat the constraint this
   * value exists to satisfy.
   */
  extractEventId(payload: unknown, rawBody: string): string;

  /**
   * Flattens a verified payload.
   *
   * Returns `null` for event types we deliberately ignore — a subscription
   * lifecycle event, a transfer, a customer update. Ignoring is a normal
   * outcome, not an error: throwing would turn "we don't care about this" into
   * a retry loop.
   */
  normalize(payload: unknown): NormalizedEvent | null;
}
