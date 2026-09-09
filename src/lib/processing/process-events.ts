import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import {
  clients,
  db,
  fxRates,
  invoices,
  payments,
  webhookEvents,
} from '@/lib/db';
import type { PaymentProvider } from '@/lib/db';
import { getAdapter, KIND_TO_PAYMENT_STATUS } from '@/lib/gateways';
import { convertAtRate } from '@/lib/money';
import type { NormalizedEvent } from '@/lib/gateways';
import { BASE_CURRENCY } from '@/lib/queries/dashboard';

/* ==========================================================================
   The drain. Turns stored webhook_events rows into domain records.
   ==========================================================================

   Runs on a schedule, not in the request path. Everything here is allowed to
   be slow, to fail, and to be retried — which is the entire reason the intake
   route does nothing but record.

   CONCURRENCY
   Rows are claimed with a single atomic `UPDATE ... WHERE id IN (SELECT ...
   FOR UPDATE SKIP LOCKED) RETURNING`. The subquery lock is what stops two
   overlapping cron invocations claiming the same row.

   The single statement matters: neon-http is stateless, so every query is its
   own implicit transaction. `SELECT ... FOR UPDATE SKIP LOCKED` on its own
   would take the lock and release it the moment the select returned, which is
   no protection at all. Claiming and locking have to happen in one statement.

   IDEMPOTENCY
   Nothing here checks-then-inserts. The claim is atomic, the payment insert
   relies on the `(provider, provider_payment_id)` unique constraint via
   `onConflictDoNothing`, and the invoice status is recomputed from the sum of
   payments rather than incremented. Running the drain twice over the same
   event produces the same database.
   ========================================================================== */

/** Backoff by attempt number, in minutes: 1m, 5m, 25m, 2h, 10h. */
const BACKOFF_MINUTES = [1, 5, 25, 120, 600];

/** After this many attempts the row is left alone for a human. */
export const MAX_ATTEMPTS = 5;

/**
 * How long a claimed row is hidden from other workers before it becomes
 * eligible again. Covers the case where a process dies mid-event: without a
 * lease the row would stay claimed forever, with too short a lease a slow event
 * gets picked up twice.
 */
const CLAIM_LEASE_MINUTES = 5;

export type ProcessOutcome = 'processed' | 'skipped' | 'failed';

export type ProcessSummary = {
  claimed: number;
  processed: number;
  skipped: number;
  failed: number;
  details: Array<{
    id: string;
    providerEventId: string;
    outcome: ProcessOutcome;
    note?: string;
  }>;
};

type ClaimedEvent = {
  id: string;
  provider: PaymentProvider;
  providerEventId: string;
  payload: unknown;
  attempts: number;
};

/* -------------------------------------------------------------------------- */
/* Claim                                                                      */
/* -------------------------------------------------------------------------- */

async function claimEvents(limit: number): Promise<ClaimedEvent[]> {
  /**
   * `processed_at is null` is written explicitly rather than folded into
   * another condition so the partial index
   * `webhook_events_next_attempt_at_idx ... where processed_at is null` is
   * usable by the planner. Without that literal predicate the index is not a
   * match and the queue degrades to a sequential scan as the table grows.
   *
   * `attempts` is incremented at claim time, not at failure time. A process
   * that dies between claiming and failing would otherwise never record the
   * attempt and would retry the same poison payload forever.
   */
  const result = await db.execute(sql`
    update webhook_events
    set attempts = attempts + 1,
        next_attempt_at = now() + make_interval(mins => ${CLAIM_LEASE_MINUTES}::int)
    where id in (
      select id
      from webhook_events
      where processed_at is null
        and signature_ok = true
        and next_attempt_at <= now()
        and attempts < ${MAX_ATTEMPTS}
      order by received_at asc
      limit ${limit}
      for update skip locked
    )
    returning id, provider, provider_event_id, payload, attempts
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    provider: String(row.provider) as PaymentProvider,
    providerEventId: String(row.provider_event_id),
    payload: row.payload,
    attempts: Number(row.attempts),
  }));
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Provider customer id first, then email, then create.
 *
 * The order matters: a provider id is an exact identity assertion from the
 * gateway, whereas an email is a guess that happens to be right most of the
 * time. Matching email-first would merge two clients who share a billing inbox.
 */
async function resolveClient(
  provider: PaymentProvider,
  event: NormalizedEvent,
): Promise<{
  id: string;
  matchedBy: 'provider' | 'email' | 'created';
  promoted: boolean;
}> {
  const providerCustomerId = event.customer.providerId;
  const email = event.customer.email?.trim().toLowerCase();

  /**
   * A live payment proves the client is real, so a client that a test event
   * created gets promoted out of demo on first live match.
   *
   * Without this the nightly demo purge would delete a client that a live
   * payment still references. `payments.client_id` carries no ON DELETE, so
   * that delete raises a foreign key violation and the entire demo reset
   * fails — one stray test event would break reseeding until someone found it.
   *
   * Promotion only ever runs demo -> live. A test event never demotes a real
   * client.
   */
  const promoteIfNeeded = async (id: string, isDemo: boolean): Promise<boolean> => {
    if (!event.livemode || !isDemo) return false;
    await db
      .update(clients)
      .set({ isDemo: false, updatedAt: new Date() })
      .where(eq(clients.id, id));
    return true;
  };

  if (providerCustomerId) {
    const [byProvider] = await db
      .select({ id: clients.id, isDemo: clients.isDemo })
      .from(clients)
      .where(sql`${clients.providerCustomerIds} ->> ${provider} = ${providerCustomerId}`)
      .limit(1);

    if (byProvider) {
      const promoted = await promoteIfNeeded(byProvider.id, byProvider.isDemo);
      return { id: byProvider.id, matchedBy: 'provider', promoted };
    }
  }

  if (email) {
    const [byEmail] = await db
      .select({ id: clients.id, isDemo: clients.isDemo })
      .from(clients)
      .where(sql`lower(${clients.email}) = ${email}`)
      .limit(1);

    if (byEmail) {
      /**
       * Matched on email but the gateway's customer id was not on file. Record
       * it now so the next payment from this customer takes the exact-identity
       * path above instead of guessing again.
       */
      if (providerCustomerId) {
        await db
          .update(clients)
          .set({
            providerCustomerIds: sql`${clients.providerCustomerIds} || jsonb_build_object(${provider}::text, ${providerCustomerId}::text)`,
            updatedAt: new Date(),
          })
          .where(eq(clients.id, byEmail.id));
      }
      const promoted = await promoteIfNeeded(byEmail.id, byEmail.isDemo);
      return { id: byEmail.id, matchedBy: 'email', promoted };
    }
  }

  const [created] = await db
    .insert(clients)
    .values({
      // clients.name is NOT NULL and a gateway may send neither name nor email.
      // A placeholder that names the source beats failing the event.
      name:
        event.customer.name ??
        (email ? email.split('@')[0]! : `Unidentified (${provider})`),
      email: event.customer.email ?? null,
      providerCustomerIds: providerCustomerId
        ? { [provider]: providerCustomerId }
        : {},
      // A client derived from a test-mode event is demo data, so the nightly
      // reset clears it instead of letting every test run leave a permanent
      // resident in the real client list.
      isDemo: !event.livemode,
    })
    .returning({ id: clients.id });

  return { id: created!.id, matchedBy: 'created', promoted: false };
}

type InvoiceMatch =
  | { invoiceId: string; currency: string; amountMinor: bigint; isDemo: boolean }
  | null;

async function resolveInvoice(event: NormalizedEvent): Promise<InvoiceMatch> {
  const ref = event.invoiceRef?.trim();
  if (!ref) return null;

  const [match] = await db
    .select({
      id: invoices.id,
      currency: invoices.currency,
      amountMinor: invoices.amountMinor,
      isDemo: invoices.isDemo,
    })
    .from(invoices)
    .where(eq(invoices.number, ref))
    .limit(1);

  if (!match) return null;
  return {
    invoiceId: match.id,
    currency: match.currency,
    amountMinor: match.amountMinor,
    isDemo: match.isDemo,
  };
}

/** Most recent rate for the pair, or null. Never guesses. */
async function resolveFx(
  currency: string,
): Promise<{ rate: string; fetchedAt: Date } | null> {
  if (currency === BASE_CURRENCY) return null;

  const [row] = await db
    .select({ rate: fxRates.rate, fetchedAt: fxRates.fetchedAt })
    .from(fxRates)
    .where(and(eq(fxRates.base, currency), eq(fxRates.quote, BASE_CURRENCY)))
    .orderBy(sql`${fxRates.fetchedAt} desc`)
    .limit(1);

  return row ?? null;
}

/**
 * Recomputes an invoice's status from the sum of its succeeded payments.
 *
 * Recomputed, never incremented — that is what makes a re-run safe. Refunds are
 * excluded rather than subtracted, matching the rule the query layer uses: a
 * refund is its own row and the original succeeded payment still stands.
 */
async function refreshInvoiceStatus(invoiceId: string): Promise<string> {
  const result = await db.execute(sql`
    with settled as (
      select
        coalesce(sum(amount_minor), 0)::bigint as settled_minor,
        max(occurred_at)                       as last_paid_at
      from payments
      where invoice_id = ${invoiceId} and status = 'succeeded'
    )
    update invoices i
    set status = case
          when s.settled_minor >= i.amount_minor then 'paid'::invoice_status
          when s.settled_minor > 0               then 'partial'::invoice_status
          else i.status
        end,
        paid_at = case
          when s.settled_minor >= i.amount_minor then s.last_paid_at
          else i.paid_at
        end,
        updated_at = now()
    from settled s
    where i.id = ${invoiceId}
    returning i.status
  `);

  const row = (result.rows as Record<string, unknown>[])[0];
  return String(row?.status ?? 'unknown');
}

/* -------------------------------------------------------------------------- */
/* Per-event processing                                                       */
/* -------------------------------------------------------------------------- */

async function markProcessed(id: string, note?: string): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), processError: note ?? null })
    .where(eq(webhookEvents.id, id));
}

async function markFailed(
  id: string,
  attempts: number,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const index = Math.min(attempts, BACKOFF_MINUTES.length) - 1;
  const minutes = BACKOFF_MINUTES[Math.max(index, 0)]!;
  const exhausted = attempts >= MAX_ATTEMPTS;

  await db
    .update(webhookEvents)
    .set({
      nextAttemptAt: new Date(Date.now() + minutes * 60_000),
      processError: `${exhausted ? 'GIVING UP' : `attempt ${attempts}/${MAX_ATTEMPTS}`}: ${message.slice(0, 900)}`,
    })
    .where(eq(webhookEvents.id, id));
}

async function processOne(
  event: ClaimedEvent,
): Promise<{ outcome: ProcessOutcome; note?: string }> {
  const adapter = getAdapter(event.provider);

  if (!adapter) {
    /**
     * Retryable, not permanent. An adapter absent today may ship in the next
     * deploy, and the event is already stored and signature-verified — giving
     * up immediately would discard a real payment because we happened to
     * receive it a week early.
     */
    throw new Error(
      `No adapter registered for provider "${event.provider}". ` +
        `The event is stored and will be reprocessed once one exists.`,
    );
  }

  const normalized = adapter.normalize(event.payload);

  if (!normalized) {
    // An event type we have no behaviour for. Processed, not failed — retrying
    // would never change the answer.
    const kind =
      typeof event.payload === 'object' && event.payload !== null
        ? String((event.payload as Record<string, unknown>).event ?? 'unknown')
        : 'unknown';
    return { outcome: 'skipped', note: `ignored: no handler for "${kind}"` };
  }

  const client = await resolveClient(event.provider, normalized);
  const invoice = await resolveInvoice(normalized);

  const notes: string[] = [];
  let invoiceId: string | null = null;

  if (invoice) {
    /**
     * Never link across the demo boundary.
     *
     * A test-mode charge must not attach to a live invoice, because
     * `refreshInvoiceStatus` would then mark a real client's invoice paid on
     * the strength of a sandbox transaction. The reverse is equally wrong: a
     * live payment linked to a demo invoice would be destroyed by the next
     * nightly reset.
     */
    if (invoice.isDemo !== !normalized.livemode) {
      notes.push(
        `demo boundary: ${normalized.livemode ? 'live' : 'test'} payment vs ` +
          `${invoice.isDemo ? 'demo' : 'live'} invoice ${normalized.invoiceRef} ` +
          `— left unmatched`,
      );
    } else if (invoice.currency !== normalized.currency) {
      /**
       * A payment in one currency against an invoice in another. Never
       * converted silently — the rate, the date and the intent are all
       * decisions a human has to make. The payment is still recorded, and it
       * lands in the unmatched queue where someone can look at it.
       */
      notes.push(
        `currency mismatch: ${normalized.currency} payment vs ${invoice.currency} invoice ` +
          `${normalized.invoiceRef} — left unmatched for review`,
      );
    } else {
      invoiceId = invoice.invoiceId;
    }
  } else if (normalized.invoiceRef) {
    notes.push(`no invoice matched reference "${normalized.invoiceRef}"`);
  }

  const fx = await resolveFx(normalized.currency);
  if (!fx && normalized.currency !== BASE_CURRENCY) {
    notes.push(`no ${normalized.currency}->${BASE_CURRENCY} rate on file`);
  }

  await db
    .insert(payments)
    .values({
      invoiceId,
      clientId: client.id,
      provider: event.provider,
      providerPaymentId: normalized.providerPaymentId,
      amountMinor: normalized.amountMinor,
      currency: normalized.currency,
      // Null for base-currency payments (no conversion needed) and for
      // foreign payments with no rate on file. The KPI query already reads
      // `baseAmountMinor ?? amountMinor`, so a null is handled, whereas a
      // guessed rate would be silently wrong.
      baseAmountMinor: fx ? convertAtRate(normalized.amountMinor, fx.rate) : null,
      fxRate: fx ? fx.rate : null,
      fxAt: fx ? fx.fetchedAt : null,
      status: KIND_TO_PAYMENT_STATUS[normalized.kind],
      method: normalized.method ?? null,
      occurredAt: normalized.occurredAt,
      // Test-mode payments are demo data and are cleared by the nightly reset.
      isDemo: !normalized.livemode,
    })
    .onConflictDoNothing();

  if (invoiceId) {
    const status = await refreshInvoiceStatus(invoiceId);
    notes.push(`invoice ${normalized.invoiceRef} -> ${status}`);
  }

  notes.unshift(
    `${normalized.livemode ? 'live' : 'TEST'}; client ${client.matchedBy}` +
      (client.promoted ? ' (promoted out of demo)' : ''),
  );
  return { outcome: 'processed', note: notes.join('; ') };
}

/* -------------------------------------------------------------------------- */
/* Drain                                                                      */
/* -------------------------------------------------------------------------- */

export async function processEvents(limit = 25): Promise<ProcessSummary> {
  const claimed = await claimEvents(Math.min(Math.max(limit, 1), 200));

  const summary: ProcessSummary = {
    claimed: claimed.length,
    processed: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const event of claimed) {
    // Each event in its own try/catch. One poison payload must never stall the
    // queue behind it or abort the batch.
    try {
      const { outcome, note } = await processOne(event);
      await markProcessed(event.id, note);

      if (outcome === 'skipped') summary.skipped += 1;
      else summary.processed += 1;

      summary.details.push({
        id: event.id,
        providerEventId: event.providerEventId,
        outcome,
        note,
      });
    } catch (error) {
      await markFailed(event.id, event.attempts, error);
      summary.failed += 1;
      summary.details.push({
        id: event.id,
        providerEventId: event.providerEventId,
        outcome: 'failed',
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
