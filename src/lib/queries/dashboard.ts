import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import type {
  InvoiceStatus,
  PaymentProvider,
  PaymentStatus,
  ReminderChannel,
} from '@/lib/db';

/* ==========================================================================
   Conventions that every function in this file obeys
   ==========================================================================

   TIMEZONE
   All bucketing, "today", and day-difference arithmetic happens in
   BUSINESS_TIMEZONE, in SQL, via `AT TIME ZONE`. Never in JavaScript, and
   never in UTC.

   `timestamptz AT TIME ZONE 'Africa/Lagos'` yields the local wall-clock
   timestamp, which is then safe to `date_trunc`. Because grouping and
   filtering both go through the same conversion, a row can never land in one
   bucket while being filtered by another.

   The case that actually differs: a payment at 00:30 Lagos on 1 September is
   23:30 UTC on 31 August. Bucketing in UTC files it under August; the business
   filed it in September. Lagos is UTC+1 with no DST, so the shift is constant
   today — but writing it as UTC+1 arithmetic would silently break the moment
   this app bills a client anywhere that observes DST.

   MONEY
   Minor units, always. Sums are computed in Postgres (numeric, arbitrary
   precision) and cast `::bigint::text` before crossing into JS, where they
   become `bigint`. Nothing is ever a `number`: ₦80m in kobo is 8.0e9, which is
   still inside 2^53 but a 12-month all-time revenue figure need not be, and
   `Number` arithmetic on kobo is a rounding bug waiting for scale.

   Revenue uses `coalesce(base_amount_minor, amount_minor)`. NGN payments store
   no FX because NGN is the reporting base, so the coalesce is what makes a
   mixed-currency sum meaningful.

   SETTLEMENT (the single predicate, used everywhere)
   `status` is consulted ONLY to exclude 'draft' (never issued) and 'void'
   (cancelled) — the two states no payment can tell you about. Everything else
   is derived:

     settled_minor     = sum(payments.amount_minor) where status = 'succeeded'
     outstanding_minor = greatest(amount_minor - settled_minor, 0)
     outstanding       = outstanding_minor > 0
     overdue           = outstanding AND due_at < now()

   This deliberately does not trust `invoices.status`. A 'sent' invoice whose
   due date passed last week is overdue whether or not a cron has rewritten the
   column, and an invoice marked 'paid' with no payment behind it is not
   revenue. Because the KPI, the overdue table and the activity feed all derive
   from this one predicate, they cannot contradict each other — which matters
   more than any single figure being right.

   REFUNDS
   Excluded from revenue, not subtracted. Every revenue expression filters to
   `status = 'succeeded'`, and a refund is its own row with status 'refunded',
   so it simply never enters the sum. Subtracting would double-count: providers
   (and our seeder) record a refund *alongside* the original succeeded payment
   rather than reversing it, so the succeeded row is still there. Net-of-refunds
   is a different figure and deserves its own function when someone needs it.
   ========================================================================== */

const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE ?? 'Africa/Lagos';

/** The reporting base. `base_amount_minor` is denominated in this. */
export const BASE_CURRENCY = 'NGN';

/** Postgres numerics and bigints arrive as strings. Never via Number. */
function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (value === null || value === undefined || value === '') return 0n;
  return BigInt(String(value));
}

function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

/** Guards the interval literal and keeps the window sane. */
function clampMonths(months: number): number {
  const n = Math.floor(months);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 36);
}

/* -------------------------------------------------------------------------- */
/* getRevenueByMonth                                                          */
/* -------------------------------------------------------------------------- */

export type RevenueMonth = {
  /** 'YYYY-MM' in business time. */
  month: string;
  /** The instant that month begins, in business time. */
  monthStart: Date;
  totalMinor: bigint;
  currency: string;
  paymentCount: number;
  /** True for the month in progress — chart it as incomplete, never as a drop. */
  isPartial: boolean;
};

/**
 * Succeeded payments bucketed by business-timezone month.
 *
 * Months with no revenue are emitted as zero rather than omitted. A left join
 * onto `generate_series` is what guarantees that: if the chart silently skipped
 * an empty month it would draw a continuous line across a gap and misstate the
 * trend.
 */
export async function getRevenueByMonth(months = 6): Promise<RevenueMonth[]> {
  const span = clampMonths(months);

  const result = await db.execute(sql`
    with bounds as (
      select date_trunc('month', now() AT TIME ZONE ${BUSINESS_TIMEZONE}) as current_month
    ),
    series as (
      select generate_series(
        (select current_month from bounds) - make_interval(months => ${span - 1}::int),
        (select current_month from bounds),
        interval '1 month'
      ) as month_start
    )
    select
      to_char(s.month_start, 'YYYY-MM')                            as month,
      (s.month_start AT TIME ZONE ${BUSINESS_TIMEZONE})            as month_start,
      coalesce(sum(coalesce(p.base_amount_minor, p.amount_minor)), 0)::bigint::text as total_minor,
      count(p.id)::int                                             as payment_count,
      (s.month_start = (select current_month from bounds))         as is_partial
    from series s
    left join payments p
      on p.status = 'succeeded'
     and date_trunc('month', p.occurred_at AT TIME ZONE ${BUSINESS_TIMEZONE}) = s.month_start
    group by s.month_start
    order by s.month_start
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    month: String(row.month),
    monthStart: new Date(String(row.month_start)),
    totalMinor: toBigInt(row.total_minor),
    currency: BASE_CURRENCY,
    paymentCount: toInt(row.payment_count),
    isPartial: row.is_partial === true,
  }));
}

/* -------------------------------------------------------------------------- */
/* getKpis                                                                    */
/* -------------------------------------------------------------------------- */

export type CurrencyAmount = { currency: string; minor: bigint };

export type DashboardKpis = {
  revenue: {
    allTimeMinor: bigint;
    currentMonthMinor: bigint;
    currency: string;
    /** Refunds are excluded from revenue above; surfaced here for context. */
    refundedAllTimeMinor: bigint;
  };
  outstanding: {
    byCurrency: CurrencyAmount[];
    /** Converted at the most recent fx_rates row per pair. Indicative. */
    baseMinor: bigint;
    baseCurrency: string;
    /** Currencies with no fx row — excluded from baseMinor, so it understates. */
    unconvertible: string[];
    invoiceCount: number;
  };
  overdue: {
    count: number;
    byCurrency: CurrencyAmount[];
    baseMinor: bigint;
    baseCurrency: string;
  };
  unmatched: {
    /** Succeeded payments with no invoice — the manual-matching queue depth. */
    count: number;
    byCurrency: CurrencyAmount[];
  };
};

/**
 * Every headline figure in one round trip, so they are all read from the same
 * snapshot. Reading them separately would let a payment land mid-render and
 * produce a dashboard whose KPIs disagree with its own tables.
 */
export async function getKpis(): Promise<DashboardKpis> {
  const result = await db.execute(sql`
    with settled as (
      select invoice_id, sum(amount_minor) as settled_minor
      from payments
      where status = 'succeeded' and invoice_id is not null
      group by invoice_id
    ),
    open_invoices as (
      select
        i.currency,
        greatest(i.amount_minor - coalesce(s.settled_minor, 0), 0) as outstanding_minor,
        (i.due_at is not null and i.due_at < now())                as is_overdue
      from invoices i
      left join settled s on s.invoice_id = i.id
      where i.status not in ('draft', 'void')
        and greatest(i.amount_minor - coalesce(s.settled_minor, 0), 0) > 0
    ),
    latest_fx as (
      select distinct on (base) base, rate
      from fx_rates
      where quote = ${BASE_CURRENCY}
      order by base, fetched_at desc
    ),
    outstanding_by_currency as (
      select
        o.currency,
        sum(o.outstanding_minor)::bigint::text as minor,
        count(*)::int                          as invoice_count,
        sum(o.outstanding_minor) filter (where o.is_overdue)::bigint::text as overdue_minor,
        count(*) filter (where o.is_overdue)::int                          as overdue_count,
        (f.rate is null and o.currency <> ${BASE_CURRENCY})                as unconvertible
      from open_invoices o
      left join latest_fx f on f.base = o.currency
      group by o.currency, f.rate
    ),
    outstanding_base as (
      select
        coalesce(sum(
          case when o.currency = ${BASE_CURRENCY} then o.outstanding_minor
               when f.rate is not null then round(o.outstanding_minor * f.rate)
               else 0 end
        ), 0)::bigint::text as base_minor,
        coalesce(sum(
          case when not o.is_overdue then 0
               when o.currency = ${BASE_CURRENCY} then o.outstanding_minor
               when f.rate is not null then round(o.outstanding_minor * f.rate)
               else 0 end
        ), 0)::bigint::text as overdue_base_minor
      from open_invoices o
      left join latest_fx f on f.base = o.currency
    ),
    revenue as (
      select
        coalesce(sum(coalesce(base_amount_minor, amount_minor))
          filter (where status = 'succeeded'), 0)::bigint::text as all_time,
        coalesce(sum(coalesce(base_amount_minor, amount_minor))
          filter (where status = 'succeeded'
            and date_trunc('month', occurred_at AT TIME ZONE ${BUSINESS_TIMEZONE})
              = date_trunc('month', now() AT TIME ZONE ${BUSINESS_TIMEZONE})), 0)::bigint::text as current_month,
        coalesce(sum(coalesce(base_amount_minor, amount_minor))
          filter (where status = 'refunded'), 0)::bigint::text as refunded
      from payments
    ),
    unmatched as (
      select currency, sum(amount_minor)::bigint::text as minor, count(*)::int as cnt
      from payments
      where invoice_id is null and status = 'succeeded'
      group by currency
    )
    select
      (select all_time from revenue)                as revenue_all_time,
      (select current_month from revenue)           as revenue_current_month,
      (select refunded from revenue)                as revenue_refunded,
      (select base_minor from outstanding_base)     as outstanding_base,
      (select overdue_base_minor from outstanding_base) as overdue_base,
      (select coalesce(json_agg(json_build_object(
          'currency', currency, 'minor', minor, 'invoiceCount', invoice_count,
          'overdueMinor', overdue_minor, 'overdueCount', overdue_count,
          'unconvertible', unconvertible) order by currency), '[]'::json)
       from outstanding_by_currency)                as outstanding_rows,
      (select coalesce(json_agg(json_build_object(
          'currency', currency, 'minor', minor, 'count', cnt) order by currency), '[]'::json)
       from unmatched)                              as unmatched_rows
  `);

  const row = (result.rows as Record<string, unknown>[])[0] ?? {};

  type OutRow = {
    currency: string;
    minor: string;
    invoiceCount: number;
    overdueMinor: string | null;
    overdueCount: number;
    unconvertible: boolean;
  };
  type UnmatchedRow = { currency: string; minor: string; count: number };

  const outstandingRows = (row.outstanding_rows ?? []) as OutRow[];
  const unmatchedRows = (row.unmatched_rows ?? []) as UnmatchedRow[];

  return {
    revenue: {
      allTimeMinor: toBigInt(row.revenue_all_time),
      currentMonthMinor: toBigInt(row.revenue_current_month),
      currency: BASE_CURRENCY,
      refundedAllTimeMinor: toBigInt(row.revenue_refunded),
    },
    outstanding: {
      byCurrency: outstandingRows.map((r) => ({
        currency: r.currency,
        minor: toBigInt(r.minor),
      })),
      baseMinor: toBigInt(row.outstanding_base),
      baseCurrency: BASE_CURRENCY,
      unconvertible: outstandingRows.filter((r) => r.unconvertible).map((r) => r.currency),
      invoiceCount: outstandingRows.reduce((n, r) => n + toInt(r.invoiceCount), 0),
    },
    overdue: {
      count: outstandingRows.reduce((n, r) => n + toInt(r.overdueCount), 0),
      byCurrency: outstandingRows
        .filter((r) => toInt(r.overdueCount) > 0)
        .map((r) => ({ currency: r.currency, minor: toBigInt(r.overdueMinor) })),
      baseMinor: toBigInt(row.overdue_base),
      baseCurrency: BASE_CURRENCY,
    },
    unmatched: {
      count: unmatchedRows.reduce((n, r) => n + toInt(r.count), 0),
      byCurrency: unmatchedRows.map((r) => ({
        currency: r.currency,
        minor: toBigInt(r.minor),
      })),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* getProviderBreakdown                                                       */
/* -------------------------------------------------------------------------- */

export type ProviderTotal = {
  provider: PaymentProvider;
  totalMinor: bigint;
  currency: string;
  paymentCount: number;
};

/**
 * Succeeded totals per provider over the window. All four providers are always
 * returned, zero included — the chart palette assigns a fixed colour per
 * provider, so a missing series would silently reassign colours between renders.
 */
export async function getProviderBreakdown(months = 6): Promise<ProviderTotal[]> {
  const span = clampMonths(months);

  const result = await db.execute(sql`
    with providers as (
      select unnest(enum_range(null::payment_provider)) as provider
    ),
    window_start as (
      select date_trunc('month', now() AT TIME ZONE ${BUSINESS_TIMEZONE})
             - make_interval(months => ${span - 1}::int) as from_month
    )
    select
      pr.provider::text                                             as provider,
      coalesce(sum(coalesce(p.base_amount_minor, p.amount_minor)), 0)::bigint::text as total_minor,
      count(p.id)::int                                              as payment_count
    from providers pr
    left join payments p
      on p.provider = pr.provider
     and p.status = 'succeeded'
     and date_trunc('month', p.occurred_at AT TIME ZONE ${BUSINESS_TIMEZONE})
         >= (select from_month from window_start)
    group by pr.provider
    order by 2 desc, 1
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    provider: String(row.provider) as PaymentProvider,
    totalMinor: toBigInt(row.total_minor),
    currency: BASE_CURRENCY,
    paymentCount: toInt(row.payment_count),
  }));
}

/* -------------------------------------------------------------------------- */
/* getOverdueInvoices                                                         */
/* -------------------------------------------------------------------------- */

export type OverdueInvoice = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  currency: string;
  amountMinor: bigint;
  /** Amount still unpaid — not the invoice face value, if partly settled. */
  outstandingMinor: bigint;
  dueAt: Date;
  /** Whole days past due, counted in business-timezone calendar days. */
  daysOverdue: number;
  /** Highest reminder already sent, 0 if none. Drives the next ladder step. */
  lastReminderSequence: number;
  status: InvoiceStatus;
};

/**
 * Past due with money still owed, worst first.
 *
 * `daysOverdue` subtracts business-timezone *dates*, not instants, so an
 * invoice due yesterday reads as 1 day overdue from midnight Lagos rather than
 * from the exact hour it fell due.
 */
export async function getOverdueInvoices(limit = 10): Promise<OverdueInvoice[]> {
  const cap = Math.min(Math.max(Math.floor(limit) || 10, 1), 200);

  const result = await db.execute(sql`
    with settled as (
      select invoice_id, sum(amount_minor) as settled_minor
      from payments
      where status = 'succeeded' and invoice_id is not null
      group by invoice_id
    ),
    last_reminder as (
      select invoice_id, max(sequence) as sequence
      from reminders
      group by invoice_id
    )
    select
      i.id, i.number, i.currency, i.status::text as status,
      i.amount_minor::text as amount_minor,
      i.due_at,
      c.id as client_id, c.name as client_name,
      greatest(i.amount_minor - coalesce(s.settled_minor, 0), 0)::bigint::text as outstanding_minor,
      ( (now() AT TIME ZONE ${BUSINESS_TIMEZONE})::date
        - (i.due_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date )::int as days_overdue,
      coalesce(lr.sequence, 0)::int as last_reminder_sequence
    from invoices i
    join clients c on c.id = i.client_id
    left join settled s on s.invoice_id = i.id
    left join last_reminder lr on lr.invoice_id = i.id
    where i.status not in ('draft', 'void')
      and i.due_at is not null
      and i.due_at < now()
      and greatest(i.amount_minor - coalesce(s.settled_minor, 0), 0) > 0
    order by days_overdue desc, outstanding_minor desc
    limit ${cap}
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    number: String(row.number),
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    currency: String(row.currency),
    amountMinor: toBigInt(row.amount_minor),
    outstandingMinor: toBigInt(row.outstanding_minor),
    dueAt: new Date(String(row.due_at)),
    daysOverdue: toInt(row.days_overdue),
    lastReminderSequence: toInt(row.last_reminder_sequence),
    status: String(row.status) as InvoiceStatus,
  }));
}

/* -------------------------------------------------------------------------- */
/* getRecentActivity                                                          */
/* -------------------------------------------------------------------------- */

export type ActivityEntry =
  | {
      kind: 'payment';
      id: string;
      occurredAt: Date;
      clientName: string | null;
      amountMinor: bigint;
      currency: string;
      status: PaymentStatus;
      provider: PaymentProvider;
      providerPaymentId: string;
      /** Null when the payment is unmatched — the manual-matching queue. */
      invoiceNumber: string | null;
    }
  | {
      kind: 'invoice_issued';
      id: string;
      occurredAt: Date;
      clientName: string;
      amountMinor: bigint;
      currency: string;
      status: InvoiceStatus;
      invoiceNumber: string;
    }
  | {
      kind: 'reminder_sent';
      id: string;
      occurredAt: Date;
      clientName: string;
      sequence: number;
      channel: ReminderChannel;
      invoiceNumber: string;
    };

/**
 * One reverse-chronological feed across three tables.
 *
 * A discriminated union rather than a widened row shape: a reminder has no
 * amount and a payment has no reminder sequence, and modelling that as a bag of
 * nullables pushes the check to every call site. `kind` narrows it once.
 */
export async function getRecentActivity(limit = 15): Promise<ActivityEntry[]> {
  const cap = Math.min(Math.max(Math.floor(limit) || 15, 1), 200);

  const result = await db.execute(sql`
    (
      select
        'payment'                as kind,
        p.id::text               as id,
        p.occurred_at            as occurred_at,
        c.name                   as client_name,
        p.amount_minor::text     as amount_minor,
        p.currency               as currency,
        p.status::text           as status,
        p.provider::text         as provider,
        p.provider_payment_id    as reference,
        i.number                 as invoice_number,
        null::int                as sequence,
        null::text               as channel
      from payments p
      left join invoices i on i.id = p.invoice_id
      left join clients  c on c.id = coalesce(p.client_id, i.client_id)
    )
    union all
    (
      select
        'invoice_issued', i.id::text, i.issued_at, c.name,
        i.amount_minor::text, i.currency, i.status::text,
        null::text, null::text, i.number, null::int, null::text
      from invoices i
      join clients c on c.id = i.client_id
      where i.issued_at is not null
    )
    union all
    (
      select
        'reminder_sent', r.id::text, r.sent_at, c.name,
        null::text, null::text, null::text,
        null::text, null::text, i.number, r.sequence::int, r.channel::text
      from reminders r
      join invoices i on i.id = r.invoice_id
      join clients  c on c.id = i.client_id
    )
    order by occurred_at desc
    limit ${cap}
  `);

  return (result.rows as Record<string, unknown>[]).map((row): ActivityEntry => {
    const occurredAt = new Date(String(row.occurred_at));
    const invoiceNumber = row.invoice_number === null ? null : String(row.invoice_number);

    switch (String(row.kind)) {
      case 'payment':
        return {
          kind: 'payment',
          id: String(row.id),
          occurredAt,
          clientName: row.client_name === null ? null : String(row.client_name),
          amountMinor: toBigInt(row.amount_minor),
          currency: String(row.currency),
          status: String(row.status) as PaymentStatus,
          provider: String(row.provider) as PaymentProvider,
          providerPaymentId: String(row.reference),
          invoiceNumber,
        };
      case 'invoice_issued':
        return {
          kind: 'invoice_issued',
          id: String(row.id),
          occurredAt,
          clientName: String(row.client_name),
          amountMinor: toBigInt(row.amount_minor),
          currency: String(row.currency),
          status: String(row.status) as InvoiceStatus,
          invoiceNumber: String(invoiceNumber),
        };
      default:
        return {
          kind: 'reminder_sent',
          id: String(row.id),
          occurredAt,
          clientName: String(row.client_name),
          sequence: toInt(row.sequence),
          channel: String(row.channel) as ReminderChannel,
          invoiceNumber: String(invoiceNumber),
        };
    }
  });
}

/* -------------------------------------------------------------------------- */
/* getUnmatchedPayments                                                       */
/* -------------------------------------------------------------------------- */

export type UnmatchedPayment = {
  id: string;
  occurredAt: Date;
  amountMinor: bigint;
  currency: string;
  baseAmountMinor: bigint | null;
  provider: PaymentProvider;
  providerPaymentId: string;
  method: string | null;
  /** Present when the provider customer id resolved to a known client. */
  clientId: string | null;
  clientName: string | null;
};

/**
 * The manual-matching queue: money received that no invoice claims.
 *
 * Filtered to `succeeded` on purpose, and it must stay that way — `getKpis`
 * counts the queue with the identical predicate, and a failed or pending
 * payment is not money waiting to be matched. If this ever needs to show failed
 * attempts, the KPI has to change in the same commit.
 */
export async function getUnmatchedPayments(): Promise<UnmatchedPayment[]> {
  const result = await db.execute(sql`
    select
      p.id::text            as id,
      p.occurred_at         as occurred_at,
      p.amount_minor::text  as amount_minor,
      p.currency            as currency,
      p.base_amount_minor::text as base_amount_minor,
      p.provider::text      as provider,
      p.provider_payment_id as provider_payment_id,
      p.method              as method,
      c.id::text            as client_id,
      c.name                as client_name
    from payments p
    left join clients c on c.id = p.client_id
    where p.invoice_id is null
      and p.status = 'succeeded'
    order by p.occurred_at desc
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    occurredAt: new Date(String(row.occurred_at)),
    amountMinor: toBigInt(row.amount_minor),
    currency: String(row.currency),
    baseAmountMinor: row.base_amount_minor === null ? null : toBigInt(row.base_amount_minor),
    provider: String(row.provider) as PaymentProvider,
    providerPaymentId: String(row.provider_payment_id),
    method: row.method === null ? null : String(row.method),
    clientId: row.client_id === null ? null : String(row.client_id),
    clientName: row.client_name === null ? null : String(row.client_name),
  }));
}
