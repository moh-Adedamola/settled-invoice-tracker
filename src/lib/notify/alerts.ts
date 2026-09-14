import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import type { PaymentProvider, TelegramAlertKind } from '@/lib/db';
import { getSettings, type Settings } from '@/lib/queries/settings';
import { MAX_ATTEMPTS } from '@/lib/processing/process-events';

import { alertAllowed, sendTelegramMessage, type TelegramOutcome } from './telegram';
import {
  paymentFailedMessage,
  paymentSucceededMessage,
  processingFailureMessage,
} from './messages';

/* ==========================================================================
   Alert dispatch, and how it avoids buzzing twice.
   ==========================================================================

   The same CLAIM, THEN SEND rule as receipts, for the same reason — see the
   header of `lib/mail/outbound.ts`, which sets it out in full. In short: insert
   a row a partial unique index refuses to duplicate, send only if the insert
   won, and record a failure on the row so the claim is released.

   ## Where this deliberately differs from the email drain

   A failure here releases the claim, as it does for email. What differs is the
   crash case, and how much it matters: the at-most-once bias that governs email
   is about a client's inbox, where a duplicate chasing letter costs a
   relationship. Nobody's relationship is damaged by a second buzz on the
   owner's own phone. A claimed-then-crashed row still stands rather than being
   swept, because a phone buzzing twice for one payment is still wrong — just
   less wrong than the email case, which is why the same bias is kept without
   adding machinery to defend it.

   ## Independence from email

   These are separate candidate queries over separate tables, not a second step
   inside the receipt loop. That is a correctness requirement before it is a
   robustness one:

     - a payment whose client has no email address gets no receipt, and still
       needs an alert
     - an UNMATCHED payment has no invoice and therefore no receipt at all, and
       is precisely the case most worth being told about
     - a failed payment is never receipted, by definition

   A receipt that throws cannot reach this code, and an alert that throws cannot
   reach the receipts. The route runs the two drains independently, and neither
   summary is derived from the other.
   ========================================================================== */

const UNIQUE_VIOLATION = '23505';

/** Walks the `cause` chain — Drizzle wraps the driver error one level down. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: string; message?: unknown; cause?: unknown };
    if (candidate.code === UNIQUE_VIOLATION) return true;
    if (
      typeof candidate.message === 'string' &&
      /duplicate key value violates unique constraint/.test(candidate.message)
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

export type AlertOutcome =
  | { status: 'sent'; id: string; messageId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/* -------------------------------------------------------------------------- */
/* Candidates                                                                 */
/* -------------------------------------------------------------------------- */

export type PaymentAlertCandidate = {
  paymentId: string;
  kind: Extract<TelegramAlertKind, 'payment_succeeded' | 'payment_failed'>;
  clientName: string | null;
  invoiceNumber: string | null;
  amountMinor: bigint;
  currency: string;
  provider: PaymentProvider;
  method: string | null;
};

/**
 * Payments that settled or failed and carry no live alert claim.
 *
 * LEFT JOINs throughout, because the rows most worth alerting on are the ones
 * with pieces missing: an unmatched payment has no invoice, and a payment the
 * matcher could not attribute has no client. An inner join would filter out
 * exactly the alerts a person needs to see.
 *
 * `not exists` is an optimisation, not the guard — the insert is the guard.
 *
 * Demo rows are excluded. A demo reset writes a batch of payments in one go,
 * and without this the first cron run afterwards would fire a burst of alerts
 * for money that did not move.
 */
export async function pendingPaymentAlerts(limit = 25): Promise<PaymentAlertCandidate[]> {
  const rows = (
    await db.execute(sql`
      select
        p.id::text            as payment_id,
        p.status::text        as status,
        p.amount_minor::text  as amount_minor,
        p.currency            as currency,
        p.provider::text      as provider,
        p.method              as method,
        i.number              as invoice_number,
        c.name                as client_name
      from payments p
      left join invoices i on i.id = p.invoice_id
      left join clients  c on c.id = coalesce(p.client_id, i.client_id)
      where p.status in ('succeeded', 'failed')
        -- Demo rows never alert: a reset writes 54 payments at once, and a
        -- burst of buzzes for money that did not move is how a person learns
        -- to ignore the alerts. All three flags, matching RECEIPT_IS_LIVE in
        -- mail/outbound.ts and for the same reason -- promotion can leave a
        -- live client holding seeded invoices. coalesce because both joins are
        -- LEFT: an unmatched payment has no invoice and no client, and that is
        -- the case most worth alerting on, so a null must not filter it out.
        and p.is_demo = false
        and coalesce(i.is_demo, false) = false
        and coalesce(c.is_demo, false) = false
        and not exists (
          select 1 from telegram_alerts t
          where t.payment_id = p.id and t.error is null
        )
      order by p.occurred_at asc
      limit ${limit}
    `)
  ).rows as Record<string, unknown>[];

  return rows.map((r) => ({
    paymentId: String(r.payment_id),
    kind: String(r.status) === 'succeeded' ? 'payment_succeeded' : 'payment_failed',
    clientName: r.client_name ? String(r.client_name) : null,
    invoiceNumber: r.invoice_number ? String(r.invoice_number) : null,
    amountMinor: BigInt(String(r.amount_minor)),
    currency: String(r.currency),
    provider: String(r.provider) as PaymentProvider,
    method: r.method ? String(r.method) : null,
  }));
}

export type ProcessingFailureCandidate = {
  eventId: string;
  provider: PaymentProvider;
  providerEventId: string;
  attempts: number;
  error: string | null;
};

/**
 * Events that exhausted their retries and will never be claimed again.
 *
 * Dead-letter is not a column — it is the state `processed_at is null and
 * attempts >= MAX_ATTEMPTS`, which is exactly the predicate `claimEvents`
 * refuses. `MAX_ATTEMPTS` is imported rather than written as 5 here, so raising
 * the ceiling in one place cannot leave this query alerting on rows the
 * processor still intends to retry.
 *
 * `signature_ok = false` is excluded: those are never claimed either, but they
 * are rejected garbage rather than a pipeline that broke, and they can arrive
 * in volume. Alerting on them would be a way to get the alerts muted.
 */
export async function pendingProcessingFailures(
  limit = 25,
): Promise<ProcessingFailureCandidate[]> {
  const rows = (
    await db.execute(sql`
      select
        e.id::text          as event_id,
        e.provider::text    as provider,
        e.provider_event_id as provider_event_id,
        e.attempts          as attempts,
        e.process_error     as process_error
      from webhook_events e
      where e.processed_at is null
        and e.signature_ok = true
        and e.attempts >= ${MAX_ATTEMPTS}
        and not exists (
          select 1 from telegram_alerts t
          where t.webhook_event_id = e.id and t.error is null
        )
      order by e.received_at asc
      limit ${limit}
    `)
  ).rows as Record<string, unknown>[];

  return rows.map((r) => ({
    eventId: String(r.event_id),
    provider: String(r.provider) as PaymentProvider,
    providerEventId: String(r.provider_event_id),
    attempts: Number(r.attempts),
    error: r.process_error ? String(r.process_error) : null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Claim, send, record                                                        */
/* -------------------------------------------------------------------------- */

type Subject = { paymentId: string } | { webhookEventId: string };

/**
 * The whole lifecycle for one alert: gate, claim, send, record.
 *
 * Shared by both kinds because the only thing that differs between them is
 * which column carries the subject and what the message says — and a second
 * copy of a claim-then-send is a second place for the ordering to be got wrong.
 */
async function dispatch(
  kind: TelegramAlertKind,
  subject: Subject,
  settings: Settings,
  buildMessage: () => string,
): Promise<AlertOutcome> {
  /*
   * 1. Gate FIRST, before claiming.
   *
   * Nothing is claimed for an alert that was never going to be sent. A claim
   * row written while the toggle was off would hold the slot permanently, so
   * turning the toggle on a minute later would produce silence for every
   * payment that arrived in the meantime — the feature would look broken
   * precisely for the person who just enabled it.
   */
  const gate = alertAllowed(kind, settings);
  if (!gate.allowed) return { status: 'skipped', reason: gate.reason };

  const paymentId = 'paymentId' in subject ? subject.paymentId : null;
  const webhookEventId = 'webhookEventId' in subject ? subject.webhookEventId : null;

  // 2. Claim. A concurrent run that got here first makes this throw 23505.
  let claimId: string;
  try {
    const claim = (
      await db.execute(sql`
        insert into telegram_alerts (kind, payment_id, webhook_event_id, chat_id)
        values (
          ${kind}::telegram_alert_kind,
          ${paymentId}::uuid,
          ${webhookEventId}::uuid,
          ${gate.chatId}
        )
        returning id::text as id
      `)
    ).rows as Record<string, unknown>[];
    claimId = String(claim[0]!.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: 'skipped', reason: 'already claimed by another run' };
    }
    throw error;
  }

  // 3. Send, and record the outcome on the claim whatever happens.
  let outcome: TelegramOutcome;
  try {
    outcome = await sendTelegramMessage(gate.chatId, buildMessage());
  } catch (error) {
    outcome = {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (outcome.status === 'sent') {
    await db.execute(sql`
      update telegram_alerts
      set provider_message_id = ${outcome.messageId}, sent_at = now()
      where id = ${claimId}::uuid
    `);
    return { status: 'sent', id: claimId, messageId: outcome.messageId };
  }

  const reason = outcome.status === 'failed' ? outcome.error : outcome.reason;
  await releaseClaim(claimId, reason);
  return { status: 'failed', reason };
}

/** Records the failure, which drops the row out of the partial unique index. */
async function releaseClaim(claimId: string, error: string): Promise<void> {
  await db.execute(sql`
    update telegram_alerts set error = ${error.slice(0, 500)} where id = ${claimId}::uuid
  `);
}

export function sendPaymentAlert(
  candidate: PaymentAlertCandidate,
  settings: Settings,
): Promise<AlertOutcome> {
  const facts = {
    clientName: candidate.clientName,
    invoiceNumber: candidate.invoiceNumber,
    amountMinor: candidate.amountMinor,
    currency: candidate.currency,
    provider: candidate.provider,
    method: candidate.method,
  };

  return dispatch(candidate.kind, { paymentId: candidate.paymentId }, settings, () =>
    candidate.kind === 'payment_succeeded'
      ? paymentSucceededMessage(facts)
      : paymentFailedMessage(facts),
  );
}

export function sendProcessingFailureAlert(
  candidate: ProcessingFailureCandidate,
  settings: Settings,
): Promise<AlertOutcome> {
  return dispatch('processing_failure', { webhookEventId: candidate.eventId }, settings, () =>
    processingFailureMessage({
      provider: candidate.provider,
      providerEventId: candidate.providerEventId,
      attempts: candidate.attempts,
      error: candidate.error,
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* The drain                                                                  */
/* -------------------------------------------------------------------------- */

export type AlertDrainSummary = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  details: Array<{ target: string; kind: TelegramAlertKind; outcome: AlertOutcome }>;
};

/**
 * One pass over both alert sources.
 *
 * Each send is independently guarded: one candidate that throws must not cost
 * the rest of the batch, since the whole point of a queue is that it drains. A
 * throw here — as opposed to a Telegram failure, which is already a value —
 * means a bug or a database problem, and it is recorded against that one target
 * and stepped over.
 */
export async function drainAlerts(limit = 25): Promise<AlertDrainSummary> {
  const settings = await getSettings();
  const details: AlertDrainSummary['details'] = [];

  const paymentCandidates = await pendingPaymentAlerts(limit);
  for (const candidate of paymentCandidates) {
    details.push({
      target: candidate.paymentId,
      kind: candidate.kind,
      outcome: await guarded(() => sendPaymentAlert(candidate, settings)),
    });
  }

  const failureCandidates = await pendingProcessingFailures(limit);
  for (const candidate of failureCandidates) {
    details.push({
      target: candidate.providerEventId,
      kind: 'processing_failure',
      outcome: await guarded(() => sendProcessingFailureAlert(candidate, settings)),
    });
  }

  return {
    considered: paymentCandidates.length + failureCandidates.length,
    sent: details.filter((d) => d.outcome.status === 'sent').length,
    skipped: details.filter((d) => d.outcome.status === 'skipped').length,
    failed: details.filter((d) => d.outcome.status === 'failed').length,
    details,
  };
}

async function guarded(run: () => Promise<AlertOutcome>): Promise<AlertOutcome> {
  try {
    return await run();
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
