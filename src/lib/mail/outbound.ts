import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { getInvoice } from '@/lib/queries/invoices';
import { getSettings, type Settings } from '@/lib/queries/settings';
import { renderInvoicePdf, invoicePdfFilename } from '@/lib/pdf/invoice';

import { sendMail } from './send';
import {
  receiptEmail,
  reminderEmail,
  type ReminderSequence,
} from './templates';

/* ==========================================================================
   Outbound dispatch, and how it avoids sending twice.
   ==========================================================================

   ## The rule both flows follow: CLAIM, THEN SEND

   Neither flow asks "has this been sent?" and then sends. That check-then-act
   has a window between the two, and two cron runs that overlap will both pass
   the check. Instead each flow INSERTS a row that a unique index will refuse to
   duplicate, and only sends if the insert won:

     receipts   unique(payment_id) where kind='receipt' and error is null
                on sent_emails — the claim IS the log row
     reminders  unique(invoice_id, sequence)
                on reminders — the table that already existed for this

   A loser takes a 23505 and moves on. No locks, no advisory keys, and the
   guarantee survives two servers as readily as two overlapping runs, because
   Postgres is the thing arbitrating.

   ## Failure releases the claim; a crash does not

   On a provider failure the receipt row is UPDATED with the error, which drops
   it out of the partial index and frees the slot for the next run. A reminder
   claim is DELETED for the same reason.

   A process that dies between claiming and sending leaves the claim standing,
   and that row will never be retried automatically. That is deliberate. The
   choice is between at-most-once and at-least-once, and for email to a client
   at-most-once is the right bias: a duplicate chasing letter costs a
   relationship, a missed one costs a day. The stuck rows are visible — a
   receipt claim with no `provider_message_id` and no `error` is exactly that
   case — and re-driving one is a human decision, which is what it should be.

   ## What is NOT a guard

   `invoices.status` is not consulted for either flow. It is a cache; the
   authority is the payments table via `invoice-status.ts`.
   ========================================================================== */

/** Postgres unique-violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * Walks the `cause` chain, because Drizzle wraps the driver error.
 *
 * Measured rather than assumed — the first version checked only the top-level
 * error and missed every real collision:
 *
 *   depth 0  Error         code=undefined  "Failed query: insert into sent_emails …"
 *   depth 1  NeonDbError   code=23505      constraint=sent_emails_receipt_once
 *
 * So the code that identifies a claim collision sits one level down, and a
 * check that stopped at the top would have let a perfectly ordinary
 * double-run escape as a 500 instead of reporting `skipped`.
 */
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

export type DispatchOutcome =
  | { status: 'sent'; id: string; recipient: string; providerMessageId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; reason: string };

/* -------------------------------------------------------------------------- */
/* Demo data never receives mail                                              */
/* -------------------------------------------------------------------------- */

/*
 * Two independent defences, because this one is worth two.
 *
 * ## 1. The addresses cannot be delivered to
 *
 * Every seeded client is at a `.invalid` domain — `billing@harborandfinch.invalid`,
 * `accounts@rantilogistics.invalid`. RFC 2606 reserves that TLD permanently and
 * guarantees no resolver will ever answer for it, so nobody can register one and
 * a stray send goes nowhere.
 *
 * They were plausible-looking real TLDs until 2026-09-14, and the change was not
 * theoretical: of the fourteen original domains, `harborandfinch.com` was
 * registered with live MX records pointed at Namecheap forwarding. A receipt to
 * `billing@harborandfinch.com` would have reached a real person's mailbox, and
 * only `DEMO_EMAIL_REDIRECT` stopped it.
 *
 * ## 2. Demo rows are excluded at the query
 *
 * `DEMO_EMAIL_REDIRECT` was never the protection. It exists to work around
 * Resend's test domain only delivering to the account owner, and it goes away
 * the day a real sending domain is verified. The nightly reset regenerates the
 * data, so a gap here would not be a one-off mistake; it would recur for as long
 * as the demo runs.
 *
 * The filter lives in the QUERY rather than at the send, so a future caller that
 * builds its own message cannot forget it, and the candidate lists stay honest
 * about what will actually go out.
 *
 * Neither defence makes the other redundant. The `.invalid` domains stop mail
 * that escapes the filter; the filter stops a demo client being mailed at all,
 * including one whose address was edited to something routable through the
 * clients form.
 *
 * ## Why all three flags, and not just the client's
 *
 * The three can legitimately disagree, and each direction is a real send:
 *
 *   demo invoice, live client  — `promoteIfNeeded` in `process-events` flips a
 *     client to live when a real payment matches it, and leaves that client's
 *     seeded invoices demo. A receipt would be about money that never moved.
 *   live invoice, demo client  — a real invoice raised against a seeded client
 *     still addresses an invented mailbox.
 *   demo payment, live invoice — a seeded payment against a real invoice would
 *     tell a real client they paid when they did not.
 *
 * All three are currently zero in the database, which is the argument for
 * writing them down rather than relying on it: the invariant is not enforced
 * anywhere, so it is a fact about today, not a guarantee.
 *
 * ## UNTESTED IN THE DIRECTION THAT MATTERS
 *
 * Measured the day the sending crons were enabled:
 *
 *   clients 14 / 0 live     receipt candidates  42 unfiltered -> 0 filtered
 *   invoices 59 / 0 live    overdue candidates   7 unfiltered -> 0 filtered
 *   payments 54 / 0 live
 *
 * Every row in the database is a demo row, so both filters below have only ever
 * been exercised in one direction. Those zeroes prove they EXCLUDE demo rows.
 * They prove nothing about whether they correctly INCLUDE a live one: a
 * predicate that matched nothing at all — a typo'd column, an inverted boolean,
 * a join that drops rows — would produce exactly the same zero, and today's
 * output would look identical.
 *
 * The first live invoice is the first real test of this path, in both
 * directions at once. When it exists, run dispatch-outbound by hand and read
 * the counts rather than assuming silence means health. A receipt that never
 * sends is as much a bug as one that sends to the wrong person, and this file
 * currently cannot tell you which of the two it is producing.
 */
const RECEIPT_IS_LIVE = sql`p.is_demo = false and i.is_demo = false and c.is_demo = false`;
const REMINDER_IS_LIVE = sql`i.is_demo = false and c.is_demo = false`;

/* -------------------------------------------------------------------------- */
/* Receipts                                                                   */
/* -------------------------------------------------------------------------- */

type ReceiptCandidate = {
  paymentId: string;
  invoiceId: string;
  amountMinor: bigint;
  occurredAt: Date;
  method: string | null;
  recipient: string;
};

/**
 * Succeeded payments against an invoice whose client has an email, that carry
 * no unexpired receipt claim.
 *
 * The `not exists` here is an optimisation, not the guard — it keeps the run
 * from rendering a PDF for work another run already did. The guard is the
 * insert below, which is what makes two concurrent runs safe.
 */
export async function pendingReceipts(limit = 25): Promise<ReceiptCandidate[]> {
  const rows = (
    await db.execute(sql`
      select
        p.id::text            as payment_id,
        p.invoice_id::text    as invoice_id,
        p.amount_minor::text  as amount_minor,
        p.occurred_at,
        p.method,
        c.email               as recipient
      from payments p
      join invoices i on i.id = p.invoice_id
      join clients c on c.id = i.client_id
      where p.status = 'succeeded'
        and p.invoice_id is not null
        and c.email is not null and c.email <> ''
        and i.status <> 'void'
        and ${RECEIPT_IS_LIVE}
        and not exists (
          select 1 from sent_emails s
          where s.payment_id = p.id and s.kind = 'receipt' and s.error is null
        )
      order by p.occurred_at asc
      limit ${limit}
    `)
  ).rows as Record<string, unknown>[];

  return rows.map((r) => ({
    paymentId: String(r.payment_id),
    invoiceId: String(r.invoice_id),
    amountMinor: BigInt(String(r.amount_minor)),
    occurredAt: new Date(String(r.occurred_at)),
    method: r.method ? String(r.method) : null,
    recipient: String(r.recipient),
  }));
}

export async function sendReceipt(
  candidate: ReceiptCandidate,
  settings: Settings,
): Promise<DispatchOutcome> {
  // 1. Claim. A concurrent run that got here first makes this throw 23505.
  let claimId: string;
  try {
    const claim = (
      await db.execute(sql`
        insert into sent_emails (kind, invoice_id, payment_id, recipient)
        values ('receipt', ${candidate.invoiceId}::uuid, ${candidate.paymentId}::uuid, ${candidate.recipient})
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

  // 2. Build and send. Anything from here on records its outcome on the claim.
  try {
    // 'all': a receipt is sent to a real client about a real invoice.
    const invoice = await getInvoice(candidate.invoiceId, 'all');
    if (!invoice) {
      await failClaim(claimId, 'The invoice disappeared between claim and send.');
      return { status: 'failed', reason: 'invoice not found' };
    }

    const body = receiptEmail({
      invoice,
      settings,
      amountMinor: candidate.amountMinor,
      paidOn: candidate.occurredAt,
      method: candidate.method,
    });

    const pdf = await renderInvoicePdf(candidate.invoiceId, 'all');

    const result = await sendMail({
      to: candidate.recipient,
      subject: body.subject,
      html: body.html,
      text: body.text,
      attachments: [{ filename: invoicePdfFilename(invoice), content: pdf }],
    });

    if (!result.ok) {
      await failClaim(claimId, result.error);
      return { status: 'failed', reason: result.error };
    }

    await db.execute(sql`
      update sent_emails set provider_message_id = ${result.providerMessageId}, sent_at = now()
      where id = ${claimId}::uuid
    `);

    return {
      status: 'sent',
      id: claimId,
      recipient: candidate.recipient,
      providerMessageId: result.providerMessageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failClaim(claimId, message);
    return { status: 'failed', reason: message };
  }
}

/** Records the failure, which releases the partial-unique claim for a retry. */
async function failClaim(claimId: string, error: string): Promise<void> {
  await db.execute(sql`
    update sent_emails set error = ${error.slice(0, 500)} where id = ${claimId}::uuid
  `);
}

/* -------------------------------------------------------------------------- */
/* Reminders                                                                  */
/* -------------------------------------------------------------------------- */

export type ReminderCandidate = {
  invoiceId: string;
  number: string;
  daysOverdue: number;
  sequence: ReminderSequence;
  recipient: string;
};

/**
 * Overdue invoices that have passed a threshold they have not been nudged for.
 *
 * The ladder comes from settings, so the thresholds are the configured ones and
 * not the historical 3/7/14. Only the HIGHEST threshold an invoice has passed
 * and not yet been sent is returned: an invoice that is 20 days late and has
 * never been chased gets the third letter, not all three in a burst.
 */
export async function pendingReminders(
  settings: Settings,
  limit = 25,
): Promise<ReminderCandidate[]> {
  if (!settings.remindersEnabled) return [];

  const ladder = [
    { sequence: 1, afterDays: settings.reminderDay1 },
    { sequence: 2, afterDays: settings.reminderDay2 },
    { sequence: 3, afterDays: settings.reminderDay3 },
  ];

  const thresholds = sql.join(
    ladder.map((s) => sql`(${s.sequence}::int, ${s.afterDays}::int)`),
    sql`, `,
  );

  const rows = (
    await db.execute(sql`
      with settled as (
        select invoice_id, sum(amount_minor) as settled_minor
        from payments
        where status = 'succeeded' and invoice_id is not null
        group by invoice_id
      ),
      ladder(sequence, after_days) as (values ${thresholds}),
      overdue as (
        select
          i.id,
          i.number,
          c.email as recipient,
          (now()::date - i.due_at::date)::int as days_overdue
        from invoices i
        join clients c on c.id = i.client_id
        left join settled s on s.invoice_id = i.id
        where i.status not in ('draft', 'void')
          and i.due_at is not null
          and i.due_at < now()
          and greatest(i.amount_minor - coalesce(s.settled_minor, 0), 0) > 0
          and c.email is not null and c.email <> ''
          and ${REMINDER_IS_LIVE}
      )
      select
        o.id::text as invoice_id,
        o.number,
        o.days_overdue,
        max(l.sequence)::int as sequence,
        o.recipient
      from overdue o
      join ladder l on o.days_overdue >= l.after_days
      where not exists (
        select 1 from reminders r
        where r.invoice_id = o.id and r.sequence = l.sequence
      )
      group by o.id, o.number, o.days_overdue, o.recipient
      order by o.days_overdue desc
      limit ${limit}
    `)
  ).rows as Record<string, unknown>[];

  return rows.map((r) => ({
    invoiceId: String(r.invoice_id),
    number: String(r.number),
    daysOverdue: Number(r.days_overdue),
    sequence: Number(r.sequence) as ReminderSequence,
    recipient: String(r.recipient),
  }));
}

export async function sendReminder(
  candidate: ReminderCandidate,
  settings: Settings,
): Promise<DispatchOutcome> {
  // 1. Claim the rung. `unique(invoice_id, sequence)` is the arbiter.
  let reminderId: string;
  try {
    const claim = (
      await db.execute(sql`
        insert into reminders (invoice_id, sequence, channel)
        values (${candidate.invoiceId}::uuid, ${candidate.sequence}, 'email')
        returning id::text as id
      `)
    ).rows as Record<string, unknown>[];
    reminderId = String(claim[0]!.id);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: 'skipped', reason: 'that rung is already sent' };
    }
    throw error;
  }

  try {
    // 'all': a reminder chases a real invoice.
    const invoice = await getInvoice(candidate.invoiceId, 'all');
    if (!invoice) {
      await releaseReminder(reminderId);
      return { status: 'failed', reason: 'invoice not found' };
    }

    const body = reminderEmail({
      invoice,
      settings,
      sequence: candidate.sequence,
      daysOverdue: candidate.daysOverdue,
    });

    const pdf = await renderInvoicePdf(candidate.invoiceId, 'all');

    const result = await sendMail({
      to: candidate.recipient,
      subject: body.subject,
      html: body.html,
      text: body.text,
      attachments: [{ filename: invoicePdfFilename(invoice), content: pdf }],
    });

    // The log row goes in either way — that is the point of having it.
    const logged = (
      await db.execute(sql`
        insert into sent_emails (kind, invoice_id, recipient, provider_message_id, error)
        values (
          'reminder',
          ${candidate.invoiceId}::uuid,
          ${candidate.recipient},
          ${result.ok ? result.providerMessageId : null},
          ${result.ok ? null : result.error.slice(0, 500)}
        )
        returning id::text as id
      `)
    ).rows as Record<string, unknown>[];

    if (!result.ok) {
      // Put the rung back so the next run may try it again.
      await releaseReminder(reminderId);
      return { status: 'failed', reason: result.error };
    }

    return {
      status: 'sent',
      id: String(logged[0]!.id),
      recipient: candidate.recipient,
      providerMessageId: result.providerMessageId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.execute(sql`
      insert into sent_emails (kind, invoice_id, recipient, error)
      values ('reminder', ${candidate.invoiceId}::uuid, ${candidate.recipient}, ${message.slice(0, 500)})
    `);
    await releaseReminder(reminderId);
    return { status: 'failed', reason: message };
  }
}

async function releaseReminder(reminderId: string): Promise<void> {
  await db.execute(sql`delete from reminders where id = ${reminderId}::uuid`);
}

/* -------------------------------------------------------------------------- */
/* Drains                                                                     */
/* -------------------------------------------------------------------------- */

export type DrainSummary = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  redirectedTo: string | null;
  details: Array<{ target: string; outcome: DispatchOutcome }>;
};

export async function drainReceipts(limit = 25): Promise<DrainSummary> {
  const settings = await getSettings();
  const candidates = await pendingReceipts(limit);
  const details: DrainSummary['details'] = [];

  for (const candidate of candidates) {
    const outcome = await sendReceipt(candidate, settings);
    details.push({ target: candidate.paymentId, outcome });
  }

  return summarise(candidates.length, details);
}

export async function drainReminders(limit = 25): Promise<DrainSummary> {
  const settings = await getSettings();
  const candidates = await pendingReminders(settings, limit);
  const details: DrainSummary['details'] = [];

  for (const candidate of candidates) {
    const outcome = await sendReminder(candidate, settings);
    details.push({ target: `${candidate.number} #${candidate.sequence}`, outcome });
  }

  return summarise(candidates.length, details);
}

function summarise(
  considered: number,
  details: DrainSummary['details'],
): DrainSummary {
  return {
    considered,
    sent: details.filter((d) => d.outcome.status === 'sent').length,
    skipped: details.filter((d) => d.outcome.status === 'skipped').length,
    failed: details.filter((d) => d.outcome.status === 'failed').length,
    redirectedTo: process.env.DEMO_EMAIL_REDIRECT?.trim() || null,
    details,
  };
}
