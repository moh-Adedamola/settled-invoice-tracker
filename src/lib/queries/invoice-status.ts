import 'server-only';

import { sql } from 'drizzle-orm';

/* ==========================================================================
   The single definition of what an invoice's status actually is.
   ==========================================================================

   Every screen that shows invoice state derives it from these fragments. They
   were extracted after the same `settled` CTE and the same
   `greatest(amount - settled, 0)` expression had been written out three times
   across dashboard.ts alone — at which point the question stops being "is this
   tidy" and becomes "which copy is wrong". A dashboard that says 7 overdue
   above a table listing 6 is worse than either number being wrong on its own.

   THE RULE, stated once:

     settled     = sum of SUCCEEDED payments against the invoice
     outstanding = greatest(amount_minor - settled, 0)
     overdue     = outstanding > 0 AND due_at has passed

   `invoices.status` is consulted ONLY to recognise 'draft' (never issued) and
   'void' (cancelled) — the two states no payment can tell you about.
   Everything else is derived, so a 'sent' invoice whose due date passed last
   week is overdue whether or not a job has rewritten the column.

   Refunds are excluded, not subtracted: a refund is its own row with status
   'refunded' and never enters `settled`, matching the processor.

   ---------------------------------------------------------------------------
   CONTRACT for callers. These fragments are interpolated into raw SQL and
   assume two aliases are in scope:

     i  the invoices table
     s  the `settledPaymentsCte` output, LEFT JOINed on s.invoice_id = i.id

   Every consumer must alias accordingly. The alternative — passing table
   references around — buys type safety over a string that is already
   exercised by both the dashboard tests and the invoice list.
   ========================================================================== */

/**
 * Per-invoice settled total. Use as the first CTE, then
 * `left join settled s on s.invoice_id = i.id`.
 */
export const settledPaymentsCte = sql`
  settled as (
    select
      invoice_id,
      sum(amount_minor) as settled_minor,
      max(occurred_at)  as last_paid_at
    from payments
    where status = 'succeeded' and invoice_id is not null
    group by invoice_id
  )`;

/** Amount still owed, floored at zero. */
export const outstandingMinorExpr = sql`greatest(i.amount_minor - coalesce(s.settled_minor, 0), 0)`;

/** Amount received so far. */
export const settledMinorExpr = sql`coalesce(s.settled_minor, 0)`;

/** Issued, not cancelled, and still owing something. */
export const isOutstandingExpr = sql`(i.status not in ('draft', 'void') and ${outstandingMinorExpr} > 0)`;

/** Outstanding AND past its due date. The dashboard's overdue count is this. */
export const isOverdueExpr = sql`(${isOutstandingExpr} and i.due_at is not null and i.due_at < now())`;

/**
 * The status a person should see, as opposed to the column's stored value.
 *
 * Order matters: a partly-paid invoice that is also past due reads as
 * `overdue`, not `partial`, because that is what needs acting on — and because
 * the dashboard's overdue total already includes partials, so any other
 * ordering would make the two screens disagree.
 */
export const effectiveStatusExpr = sql`
  case
    when i.status = 'draft' then 'draft'
    when i.status = 'void'  then 'void'
    when ${outstandingMinorExpr} <= 0 then 'paid'
    when i.due_at is not null and i.due_at < now() then 'overdue'
    when coalesce(s.settled_minor, 0) > 0 then 'partial'
    else 'sent'
  end`;

/** Whole days past due, counted in business-timezone calendar days. */
export function daysOverdueExpr(timezone: string) {
  return sql`(
    case
      when ${isOverdueExpr}
      then ((now() AT TIME ZONE ${timezone})::date - (i.due_at AT TIME ZONE ${timezone})::date)
      else 0
    end
  )::int`;
}

/** The six values `effectiveStatusExpr` can produce. */
export const EFFECTIVE_STATUSES = [
  'draft',
  'sent',
  'partial',
  'overdue',
  'paid',
  'void',
] as const;

export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number];

export function isEffectiveStatus(value: string): value is EffectiveStatus {
  return (EFFECTIVE_STATUSES as readonly string[]).includes(value);
}
