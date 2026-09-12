import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import type { PaymentStatus } from '@/lib/db';

/* ==========================================================================
   Writing payments.
   ==========================================================================

   ## The transaction question, answered by measurement

   Matching a payment changes two tables: `payments.invoice_id`, and the
   invoice's cached `status` / `paid_at`. Under neon-http every statement is
   its own implicit transaction, so as two statements a failure between them
   leaves a linked payment against a stale invoice status.

   Both are written as ONE data-modifying CTE, the same construction
   `invoice-writes.ts` uses for line items. One statement, one implicit
   transaction, no pooled connection, no `drizzle-orm/neon-serverless`.

   ### The trap that makes this non-obvious

   Every sub-statement of a CTE sees the SAME snapshot, taken before the
   statement ran. A later CTE that re-reads `payments` therefore does NOT see
   the row an earlier CTE just linked. Measured against the live database:

     with bumped as (update invoices set updated_at = now() ... returning updated_at),
          readback as (select updated_at from invoices where id = ...)

     RETURNING  18:05:31.370887   <- the new value
     re-read    17:36:57.604120   <- the OLD value, same statement

   So the naive `settled` CTE — "sum the succeeded payments for this invoice" —
   would compute the total as it was BEFORE the link and write a status that is
   one payment out of date. The fix is to union the payment in explicitly,
   conditional on the link having actually happened:

     where p.status = 'succeeded'
       and ( (p.invoice_id = :invoice and p.id <> :payment)     <- the others
             or (p.id = :payment and exists (select 1 from linked)) )   <- this one

   Verified: the total the statement computed equalled the total that committed
   (280500000 both sides). `unlinkPaymentRow` is the mirror image and simply
   excludes the row instead.

   ### Why the cached column matters less than it looks

   Worth saying plainly, because it bounds the blast radius: `invoices.status`
   is a CACHE. Every screen derives status from `invoice-status.ts`, which reads
   payments — the column is consulted only to recognise 'draft' and 'void', the
   two states no payment can tell you about. A stale cache would not produce a
   wrong figure anywhere a user can see. It is kept correct anyway, because the
   next person to write a query against `invoices.status` should not have to
   discover that it lies.

   ### One difference from the processor

   `process-events.ts` recalculates with `else i.status` — it never moves a
   status down, which is right for a webhook that only ever adds money. Unmatch
   removes money, so these statements recompute the status from scratch in both
   directions, mirroring `effectiveStatusExpr` exactly, including 'overdue'.
   A recompute that could only go up would leave an invoice reading 'paid'
   after the payment that paid it was detached.
   ========================================================================== */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The status an invoice should carry, from its own columns and a settled total.
 *
 * Mirrors `effectiveStatusExpr` in `invoice-status.ts`, with one difference
 * forced by the context: that fragment reads `s.settled_minor` from a joined
 * CTE, and here the total is a scalar computed in the same statement. Draft and
 * void are preserved — no payment resurrects a cancelled invoice, and a draft
 * cannot be paid because it was never sent.
 */
const statusFromSettled = (settled: string) => sql`
  case
    when i.status = 'draft' then 'draft'::invoice_status
    when i.status = 'void'  then 'void'::invoice_status
    when ${sql.raw(settled)} >= i.amount_minor then 'paid'::invoice_status
    when i.due_at is not null and i.due_at < now() then 'overdue'::invoice_status
    when ${sql.raw(settled)} > 0 then 'partial'::invoice_status
    else 'sent'::invoice_status
  end`;

const paidAtFromSettled = (settled: string, lastPaid: string) => sql`
  case
    when ${sql.raw(settled)} >= i.amount_minor then ${sql.raw(lastPaid)}
    else null
  end`;

export type MatchRefusal =
  | 'payment-not-found'
  | 'invoice-not-found'
  | 'currency-mismatch'
  | 'invoice-void'
  | 'invoice-draft'
  | 'already-matched';

export type MatchResult =
  | {
      ok: true;
      invoiceNumber: string;
      invoiceStatus: string;
      /** True when this link took the invoice past its total. */
      overpaid: boolean;
    }
  | { ok: false; reason: MatchRefusal; detail?: string };

/**
 * Links a payment to an invoice and recomputes that invoice, in one statement.
 *
 * Refuses rather than silently no-opping, and every refusal carries a reason
 * the action turns into a sentence. A write that quietly does nothing is the
 * worst of the three outcomes: the user believes it worked.
 *
 * A payment already attached to another invoice is refused, not moved. Moving
 * it would mean recomputing two invoices in one statement, and — more to the
 * point — "unmatch, then match" is the honest description of what is happening
 * and the UI already offers both halves.
 */
export async function linkPaymentRow(
  paymentId: string,
  invoiceId: string,
): Promise<MatchResult> {
  if (!UUID.test(paymentId)) return { ok: false, reason: 'payment-not-found' };
  if (!UUID.test(invoiceId)) return { ok: false, reason: 'invoice-not-found' };

  const result = await db.execute(sql`
    with p as (
      select id, currency, invoice_id, amount_minor, status
      from payments where id = ${paymentId}::uuid
    ),
    inv as (
      select id, number, currency, amount_minor, status, due_at
      from invoices where id = ${invoiceId}::uuid
    ),
    -- Every precondition, evaluated once against the snapshot so the caller
    -- gets a reason even when nothing was written.
    checks as (
      select
        (select count(*) from p)   = 1 as payment_exists,
        (select count(*) from inv) = 1 as invoice_exists,
        (select currency from p) is not distinct from (select currency from inv) as currency_ok,
        coalesce((select status from inv) <> 'void', false)  as not_void,
        coalesce((select status from inv) <> 'draft', false) as not_draft,
        (select invoice_id from p) is null as unmatched
    ),
    linked as (
      update payments
      set invoice_id = ${invoiceId}::uuid
      where id = ${paymentId}::uuid
        and (select payment_exists and invoice_exists and currency_ok
                    and not_void and not_draft and unmatched from checks)
      returning id
    ),
    -- The snapshot does not include the link above, so the payment is unioned
    -- in by hand, conditional on the update having fired.
    settled as (
      select
        coalesce(sum(pay.amount_minor), 0)::bigint as settled_minor,
        max(pay.occurred_at)                       as last_paid_at
      from payments pay
      where pay.status = 'succeeded'
        and (
          (pay.invoice_id = ${invoiceId}::uuid and pay.id <> ${paymentId}::uuid)
          or (pay.id = ${paymentId}::uuid and exists (select 1 from linked))
        )
    ),
    recomputed as (
      update invoices i
      set status     = ${statusFromSettled('s.settled_minor')},
          paid_at    = ${paidAtFromSettled('s.settled_minor', 's.last_paid_at')},
          updated_at = now()
      from settled s
      where i.id = ${invoiceId}::uuid and exists (select 1 from linked)
      returning i.status, i.amount_minor, s.settled_minor
    )
    select
      (select payment_exists from checks)  as payment_exists,
      (select invoice_exists from checks)  as invoice_exists,
      (select currency_ok from checks)     as currency_ok,
      (select not_void from checks)        as not_void,
      (select not_draft from checks)       as not_draft,
      (select unmatched from checks)       as unmatched,
      (select count(*) from linked)::int   as linked_rows,
      (select number from inv)             as invoice_number,
      (select currency from p)             as payment_currency,
      (select currency from inv)           as invoice_currency,
      (select status from recomputed)      as new_status,
      (select (settled_minor > amount_minor) from recomputed) as overpaid
  `);

  const row = (result.rows as Record<string, unknown>[])[0]!;

  if (row.payment_exists !== true) return { ok: false, reason: 'payment-not-found' };
  if (row.invoice_exists !== true) return { ok: false, reason: 'invoice-not-found' };
  if (row.unmatched !== true) return { ok: false, reason: 'already-matched' };
  if (row.not_void !== true) return { ok: false, reason: 'invoice-void' };
  if (row.not_draft !== true) return { ok: false, reason: 'invoice-draft' };
  if (row.currency_ok !== true) {
    return {
      ok: false,
      reason: 'currency-mismatch',
      detail: `${String(row.payment_currency)} → ${String(row.invoice_currency)}`,
    };
  }
  if (Number(row.linked_rows) !== 1) return { ok: false, reason: 'payment-not-found' };

  return {
    ok: true,
    invoiceNumber: String(row.invoice_number),
    invoiceStatus: String(row.new_status),
    overpaid: row.overpaid === true,
  };
}

export type UnlinkResult =
  | { ok: true; invoiceId: string; invoiceNumber: string; invoiceStatus: string }
  | { ok: false; reason: 'payment-not-found' | 'not-matched' };

/**
 * Detaches a payment from its invoice and recomputes that invoice downward.
 *
 * The mirror of the above: the settled total EXCLUDES this payment
 * unconditionally, because after the detach it no longer counts — and the
 * snapshot still shows it attached, so excluding it by id is exactly the
 * correction the stale snapshot needs.
 */
export async function unlinkPaymentRow(paymentId: string): Promise<UnlinkResult> {
  if (!UUID.test(paymentId)) return { ok: false, reason: 'payment-not-found' };

  const result = await db.execute(sql`
    with p as (
      select id, invoice_id from payments where id = ${paymentId}::uuid
    ),
    inv as (
      select id, number from invoices where id = (select invoice_id from p)
    ),
    unlinked as (
      update payments
      set invoice_id = null
      where id = ${paymentId}::uuid and invoice_id is not null
      returning id
    ),
    settled as (
      select
        coalesce(sum(pay.amount_minor), 0)::bigint as settled_minor,
        max(pay.occurred_at)                       as last_paid_at
      from payments pay
      where pay.status = 'succeeded'
        and pay.invoice_id = (select invoice_id from p)
        and pay.id <> ${paymentId}::uuid
    ),
    recomputed as (
      update invoices i
      set status     = ${statusFromSettled('s.settled_minor')},
          paid_at    = ${paidAtFromSettled('s.settled_minor', 's.last_paid_at')},
          updated_at = now()
      from settled s
      where i.id = (select invoice_id from p) and exists (select 1 from unlinked)
      returning i.status
    )
    select
      (select count(*) from p)::int         as payment_exists,
      (select invoice_id from p)::text      as invoice_id,
      (select number from inv)              as invoice_number,
      (select count(*) from unlinked)::int  as unlinked_rows,
      (select status from recomputed)       as new_status
  `);

  const row = (result.rows as Record<string, unknown>[])[0]!;

  if (Number(row.payment_exists) !== 1) return { ok: false, reason: 'payment-not-found' };
  if (Number(row.unlinked_rows) !== 1) return { ok: false, reason: 'not-matched' };

  return {
    ok: true,
    invoiceId: String(row.invoice_id),
    invoiceNumber: String(row.invoice_number),
    invoiceStatus: String(row.new_status),
  };
}

/* -------------------------------------------------------------------------- */
/* Manual entry                                                               */
/* -------------------------------------------------------------------------- */

export type ManualPaymentInput = {
  clientId: string;
  /** Optional: cash can arrive against nothing in particular. */
  invoiceId: string | null;
  amountMinor: bigint;
  currency: string;
  occurredAt: Date;
  method: string;
  status: PaymentStatus;
};

export type ManualPaymentResult =
  | { ok: true; id: string; providerPaymentId: string; overpaid: boolean }
  | {
      ok: false;
      reason: 'client-not-found' | 'invoice-not-found' | 'currency-mismatch' | 'reference-collision';
      detail?: string;
    };

/**
 * The reference a manual payment gets, since no gateway supplies one.
 *
 * `MAN-YYYYMMDD-XXXXXX`, where the suffix is six characters from a
 * deliberately reduced alphabet: no vowels (nothing spells a word by accident),
 * no `0/O` or `1/I/L`, because these get read down a phone line and copied off
 * a bank statement by hand.
 *
 * The date prefix is the payment's own date, so the reference sorts and reads
 * usefully; it is not a uniqueness mechanism.
 *
 * **Collision safety does not rest on the random suffix.** 26^6 is comfortable
 * but "comfortable" is not a guarantee, and `unique(provider,
 * provider_payment_id)` is the real arbiter. The insert is
 * `on conflict do nothing returning id`; no returned row means the reference
 * was taken, and the caller retries with a fresh one. The constraint decides,
 * the RNG only proposes.
 */
const REFERENCE_ALPHABET = 'BCDFGHJKMNPQRSTVWXYZ23456789';
const REFERENCE_ATTEMPTS = 8;

function manualReference(occurredAt: Date): string {
  const day = occurredAt.toISOString().slice(0, 10).replace(/-/g, '');
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => REFERENCE_ALPHABET[b % REFERENCE_ALPHABET.length]).join('');
  return `MAN-${day}-${suffix}`;
}

/**
 * Records a payment that never came through a gateway, and — when it names an
 * invoice — recomputes that invoice, in the same one statement as the insert.
 *
 * The same snapshot rule applies and bites harder here: the row being inserted
 * does not exist in the snapshot at all, so its amount is added to the settled
 * total as a literal rather than read back from the table.
 */
export async function insertManualPayment(
  input: ManualPaymentInput,
): Promise<ManualPaymentResult> {
  if (!UUID.test(input.clientId)) return { ok: false, reason: 'client-not-found' };
  if (input.invoiceId !== null && !UUID.test(input.invoiceId)) {
    return { ok: false, reason: 'invoice-not-found' };
  }

  const amount = String(input.amountMinor);

  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    const reference = manualReference(input.occurredAt);

    const result = await db.execute(sql`
      with client_row as (
        select id from clients where id = ${input.clientId}::uuid
      ),
      inv as (
        select id, number, currency, amount_minor, status, due_at
        from invoices
        where ${input.invoiceId === null ? sql`false` : sql`id = ${input.invoiceId}::uuid`}
      ),
      checks as (
        select
          (select count(*) from client_row) = 1 as client_ok,
          ${
            input.invoiceId === null
              ? sql`true`
              : sql`(select count(*) from inv) = 1`
          } as invoice_ok,
          ${
            input.invoiceId === null
              ? sql`true`
              : sql`(select currency from inv) is not distinct from ${input.currency}`
          } as currency_ok
      ),
      inserted as (
        insert into payments (
          invoice_id, client_id, provider, provider_payment_id,
          amount_minor, currency, status, method, occurred_at, is_demo
        )
        select
          ${input.invoiceId === null ? sql`null::uuid` : sql`${input.invoiceId}::uuid`},
          ${input.clientId}::uuid,
          'manual',
          ${reference},
          ${amount}::bigint,
          ${input.currency},
          ${input.status}::payment_status,
          ${input.method},
          ${input.occurredAt.toISOString()}::timestamptz,
          false
        where (select client_ok and invoice_ok and currency_ok from checks)
        on conflict (provider, provider_payment_id) do nothing
        returning id
      ),
      -- The inserted row is not in the snapshot, so its amount is added as a
      -- literal rather than re-read. Only a succeeded payment moves a balance.
      settled as (
        select
          coalesce(sum(pay.amount_minor), 0)::bigint
            + case
                when exists (select 1 from inserted) and ${input.status} = 'succeeded'
                then ${amount}::bigint else 0
              end as settled_minor,
          greatest(
            coalesce(max(pay.occurred_at), 'epoch'::timestamptz),
            case
              when exists (select 1 from inserted) and ${input.status} = 'succeeded'
              then ${input.occurredAt.toISOString()}::timestamptz
              else 'epoch'::timestamptz
            end
          ) as last_paid_at
        from payments pay
        where pay.status = 'succeeded' and pay.invoice_id = (select id from inv)
      ),
      recomputed as (
        update invoices i
        set status     = ${statusFromSettled('s.settled_minor')},
            paid_at    = ${paidAtFromSettled('s.settled_minor', 's.last_paid_at')},
            updated_at = now()
        from settled s
        where i.id = (select id from inv) and exists (select 1 from inserted)
        returning i.status, i.amount_minor, s.settled_minor
      )
      select
        (select client_ok from checks)        as client_ok,
        (select invoice_ok from checks)       as invoice_ok,
        (select currency_ok from checks)      as currency_ok,
        (select currency from inv)            as invoice_currency,
        (select id from inserted)::text       as inserted_id,
        (select (settled_minor > amount_minor) from recomputed) as overpaid
    `);

    const row = (result.rows as Record<string, unknown>[])[0]!;

    if (row.client_ok !== true) return { ok: false, reason: 'client-not-found' };
    if (row.invoice_ok !== true) return { ok: false, reason: 'invoice-not-found' };
    if (row.currency_ok !== true) {
      return {
        ok: false,
        reason: 'currency-mismatch',
        detail: `${input.currency} → ${String(row.invoice_currency ?? '?')}`,
      };
    }

    if (row.inserted_id) {
      return {
        ok: true,
        id: String(row.inserted_id),
        providerPaymentId: reference,
        overpaid: row.overpaid === true,
      };
    }
    // No row: the reference was already taken. Try another.
  }

  return { ok: false, reason: 'reference-collision' };
}
