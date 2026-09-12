import 'server-only';

import { cache } from 'react';
import { sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import type { PaymentProvider, PaymentStatus } from '@/lib/db';
import { BUSINESS_TIMEZONE } from '@/lib/business-timezone';

import {
  effectiveStatusExpr,
  outstandingMinorExpr,
  settledMinorExpr,
  settledPaymentsCte,
  type EffectiveStatus,
} from './invoice-status';

/* ==========================================================================
   Payments: the money side of the ledger.
   ==========================================================================

   Same shape as `invoices.ts` and `clients.ts` — URL-driven filters, offset
   pagination, `count(*) over()` riding along so the total survives the LIMIT.
   The reasoning for offset rather than keyset is written out once in
   invoices.ts and applies here unchanged.

   ## What makes this list different

   A payment has a state the other two lists do not: it may belong to no
   invoice. That is not an error — a bank transfer with no reference is an
   ordinary Tuesday — but it is the only row on the page that needs a person to
   do something. So `unmatched` is a first-class filter AND a visible marker on
   the row, because the brief for this screen is "what needs action", and a
   thing you have to filter for in order to see is a thing you will forget.

   ## Refunds are rows, not subtractions

   Consistent with `invoice-status.ts`: a refund is its own payment row with
   status 'refunded' and never enters the settled total. This list shows it as
   what it is rather than netting it off anything.
   ========================================================================== */

export const PAYMENT_SORT_KEYS = [
  'date',
  'amount',
  'client',
  'provider',
  'status',
] as const;
export type PaymentSortKey = (typeof PAYMENT_SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

export const DEFAULT_SORT: PaymentSortKey = 'date';
export const DEFAULT_DIRECTION: SortDirection = 'desc';
export const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'succeeded',
  'pending',
  'failed',
  'refunded',
];

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  'stripe',
  'paystack',
  'flutterwave',
  'manual',
];

export function isPaymentSortKey(value: string): value is PaymentSortKey {
  return (PAYMENT_SORT_KEYS as readonly string[]).includes(value);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function isPaymentProvider(value: string): value is PaymentProvider {
  return (PAYMENT_PROVIDERS as readonly string[]).includes(value);
}

export type PaymentListParams = {
  status?: PaymentStatus[];
  provider?: PaymentProvider[];
  currency?: string;
  /** YYYY-MM-DD, business-timezone calendar days, on `occurred_at`. */
  from?: string;
  to?: string;
  /** Only payments no invoice claims. */
  unmatchedOnly?: boolean;
  /** Matches the provider payment id or the client name. */
  q?: string;
  sort?: PaymentSortKey;
  direction?: SortDirection;
  page?: number;
  pageSize?: number;
};

export type PaymentListRow = {
  id: string;
  occurredAt: Date;
  clientId: string | null;
  clientName: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  provider: PaymentProvider;
  method: string | null;
  amountMinor: bigint;
  currency: string;
  status: PaymentStatus;
  providerPaymentId: string;
  /** No invoice claims this money. The row's action state. */
  unmatched: boolean;
};

export type PaymentListResult = {
  rows: PaymentListRow[];
  total: number;
  unfilteredTotal: number;
  /** Unmatched across the WHOLE ledger, not this page — the queue depth. */
  unmatchedTotal: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * Sort targets. A whitelist, not interpolation: `sort` arrives from a URL.
 *
 * `status` sorts by what needs attention rather than alphabetically, the same
 * decision the invoice ledger makes and for the same reason. Failed first: a
 * failed payment is the one that may need re-taking.
 */
const SORT_EXPRESSIONS: Record<PaymentSortKey, SQL> = {
  date: sql`e.occurred_at`,
  amount: sql`e.amount_minor`,
  client: sql`lower(coalesce(e.client_name, ''))`,
  provider: sql`e.provider::text`,
  status: sql`case e.status
    when 'failed'    then 0
    when 'pending'   then 1
    when 'refunded'  then 2
    when 'succeeded' then 3
    else 4 end`,
};

const clampPage = (page?: number) =>
  Number.isFinite(page) && (page ?? 0) > 0 ? Math.floor(page!) : 1;

const clampPageSize = (size?: number) =>
  Number.isFinite(size) && (size ?? 0) > 0
    ? Math.min(Math.floor(size!), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

const toBigInt = (value: unknown): bigint =>
  value === null || value === undefined || value === '' ? 0n : BigInt(String(value));

/** Escapes a user's `%` and `_` so they stay literal rather than becoming wildcards. */
const likePattern = (search: string) =>
  `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export async function listPayments(
  params: PaymentListParams = {},
): Promise<PaymentListResult> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const sortKey =
    params.sort && isPaymentSortKey(params.sort) ? params.sort : DEFAULT_SORT;
  const direction: SortDirection =
    params.direction === 'asc' ? 'asc' : DEFAULT_DIRECTION;

  const filters: SQL[] = [sql`true`];

  if (params.status && params.status.length > 0) {
    filters.push(
      sql`e.status in (${sql.join(
        params.status.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  if (params.provider && params.provider.length > 0) {
    filters.push(
      sql`e.provider in (${sql.join(
        params.provider.map((p) => sql`${p}`),
        sql`, `,
      )})`,
    );
  }
  if (params.currency) filters.push(sql`e.currency = ${params.currency}`);

  // Business-timezone calendar days, matching how the dates are displayed. A
  // 23:30 Lagos payment must not filter as the previous day.
  if (params.from) {
    filters.push(
      sql`(e.occurred_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date >= ${params.from}::date`,
    );
  }
  if (params.to) {
    filters.push(
      sql`(e.occurred_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date <= ${params.to}::date`,
    );
  }
  if (params.unmatchedOnly) filters.push(sql`e.invoice_id is null`);

  const search = params.q?.trim();
  if (search) {
    const pattern = likePattern(search);
    filters.push(
      sql`(
        e.provider_payment_id ilike ${pattern} escape '\\'
        or coalesce(e.client_name, '') ilike ${pattern} escape '\\'
        or coalesce(e.invoice_number, '') ilike ${pattern} escape '\\'
      )`,
    );
  }

  const whereSql = sql.join(filters, sql` and `);
  const orderSql = SORT_EXPRESSIONS[sortKey];
  const directionSql = direction === 'asc' ? sql`asc` : sql`desc`;

  const result = await db.execute(sql`
    with e as (
      select
        p.id,
        p.occurred_at,
        p.provider,
        p.provider_payment_id,
        p.method,
        p.amount_minor,
        p.currency,
        p.status,
        p.invoice_id,
        i.number   as invoice_number,
        -- The client on the payment, falling back to the invoice's client: a
        -- gateway that identified the invoice but not the customer still tells
        -- us who paid, and a row reading "—" next to a matched invoice looks
        -- like missing data rather than a shape of the record.
        coalesce(p.client_id, i.client_id) as client_id,
        c.name                             as client_name
      from payments p
      left join invoices i on i.id = p.invoice_id
      left join clients c on c.id = coalesce(p.client_id, i.client_id)
    )
    select
      e.id::text                as id,
      e.occurred_at,
      e.provider,
      e.provider_payment_id,
      e.method,
      e.amount_minor::text      as amount_minor,
      e.currency,
      e.status,
      e.invoice_id::text        as invoice_id,
      e.invoice_number,
      e.client_id::text         as client_id,
      e.client_name,
      count(*) over()::int      as total_count
    from e
    where ${whereSql}
    -- id breaks ties so paging is stable: two payments can share a timestamp
    -- to the second, and without a total order a row can appear on two pages.
    order by ${orderSql} ${directionSql} nulls last, e.id desc
    limit ${pageSize}
    offset ${(page - 1) * pageSize}
  `);

  const raw = result.rows as Record<string, unknown>[];

  const rows: PaymentListRow[] = raw.map((row) => ({
    id: String(row.id),
    occurredAt: new Date(String(row.occurred_at)),
    clientId: row.client_id ? String(row.client_id) : null,
    clientName: row.client_name ? String(row.client_name) : null,
    invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
    provider: String(row.provider) as PaymentProvider,
    method: row.method ? String(row.method) : null,
    amountMinor: toBigInt(row.amount_minor),
    currency: String(row.currency),
    status: String(row.status) as PaymentStatus,
    providerPaymentId: String(row.provider_payment_id),
    unmatched: row.invoice_id === null || row.invoice_id === undefined,
  }));

  const total = raw.length > 0 ? Number(raw[0]!.total_count) : 0;

  /*
   * The queue depth is asked for on every render, not only when the page is
   * empty: the list leads with "N unmatched" whatever the filters say, so
   * someone who filtered down to one client still sees the work waiting.
   */
  const [counts] = (
    await db.execute(sql`
      select
        count(*)::int                                        as all_payments,
        count(*) filter (where invoice_id is null)::int      as unmatched
      from payments
    `)
  ).rows as Record<string, unknown>[];

  return {
    rows,
    total,
    unfilteredTotal: Number(counts?.all_payments ?? 0),
    unmatchedTotal: Number(counts?.unmatched ?? 0),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* -------------------------------------------------------------------------- */
/* Filter options                                                             */
/* -------------------------------------------------------------------------- */

export type PaymentFilterOptions = {
  currencies: string[];
  providers: PaymentProvider[];
};

/** Only values that can actually match something — a filter offering an empty result is noise. */
export const getPaymentFilterOptions = cache(
  async (): Promise<PaymentFilterOptions> => {
    const result = await db.execute(sql`
      select distinct currency, provider from payments order by currency
    `);
    const raw = result.rows as Record<string, unknown>[];
    return {
      currencies: [...new Set(raw.map((r) => String(r.currency)))].sort(),
      providers: PAYMENT_PROVIDERS.filter((p) =>
        raw.some((r) => String(r.provider) === p),
      ),
    };
  },
);

/* -------------------------------------------------------------------------- */
/* Detail                                                                     */
/* -------------------------------------------------------------------------- */

export type SiblingPayment = {
  id: string;
  occurredAt: Date;
  amountMinor: bigint;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerPaymentId: string;
  method: string | null;
  /** Outstanding on the invoice immediately after this row. */
  balanceAfterMinor: bigint;
  /** True for the payment being viewed — its place in the sequence. */
  isThisOne: boolean;
};

export type PaymentDetail = {
  id: string;
  occurredAt: Date;
  provider: PaymentProvider;
  providerPaymentId: string;
  method: string | null;
  amountMinor: bigint;
  currency: string;
  status: PaymentStatus;
  baseAmountMinor: bigint | null;
  fxRate: string | null;
  fxAt: Date | null;
  isDemo: boolean;
  createdAt: Date;
  client: { id: string; name: string; email: string | null; archivedAt: Date | null } | null;
  invoice: {
    id: string;
    number: string;
    currency: string;
    amountMinor: bigint;
    paidMinor: bigint;
    outstandingMinor: bigint;
    status: EffectiveStatus;
    issuedAt: Date | null;
    dueAt: Date | null;
  } | null;
  /** Every payment against the same invoice, oldest first, with a running balance. */
  siblings: SiblingPayment[];
};

/**
 * One payment, its client, its invoice if matched, and the whole sequence of
 * payments against that invoice.
 *
 * The sequence is the point of the detail view. A payment on its own says
 * "₦290,628 succeeded"; the sequence says whether that cleared the invoice,
 * landed between two other instalments, or sat behind a failed attempt. The
 * balance column is computed with a window `filter (where status =
 * 'succeeded')`, so a failed row repeats the balance above it rather than
 * moving it — the same construction the invoice detail page uses, and for the
 * same reason: the repetition is the evidence.
 *
 * Returns null for a malformed or absent id so the page can `notFound()`.
 * `cache` so `generateMetadata` and the page body share one read.
 */
export const getPayment = cache(async (id: string): Promise<PaymentDetail | null> => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const result = await db.execute(sql`
    with ${settledPaymentsCte},
    p as (
      select * from payments where id = ${id}::uuid
    ),
    inv as (
      select
        i.id,
        i.number,
        i.currency,
        i.amount_minor,
        i.issued_at,
        i.due_at,
        ${settledMinorExpr}     as paid_minor,
        ${outstandingMinorExpr} as outstanding_minor,
        ${effectiveStatusExpr}  as effective_status
      from invoices i
      left join settled s on s.invoice_id = i.id
      where i.id = (select invoice_id from p)
    ),
    siblings as (
      select
        sp.id,
        sp.occurred_at,
        sp.amount_minor,
        sp.status,
        sp.provider,
        sp.provider_payment_id,
        sp.method,
        -- Outstanding immediately after this row. Only succeeded payments move
        -- it, so a failed attempt repeats the previous balance.
        greatest(
          (select amount_minor from inv) - sum(sp.amount_minor)
            filter (where sp.status = 'succeeded')
            over (order by sp.occurred_at, sp.id rows between unbounded preceding and current row),
          0
        ) as balance_after_minor
      from payments sp
      where sp.invoice_id is not null
        and sp.invoice_id = (select invoice_id from p)
    )
    select
      (select row_to_json(x) from (
        select
          p.id::text, p.occurred_at, p.provider, p.provider_payment_id, p.method,
          p.amount_minor::text as amount_minor, p.currency, p.status,
          p.base_amount_minor::text as base_amount_minor, p.fx_rate, p.fx_at,
          p.is_demo, p.created_at
        from p
      ) x) as payment,
      (select row_to_json(x) from (
        select c.id::text, c.name, c.email, c.archived_at
        from clients c
        where c.id = coalesce((select client_id from p), (select client_id from invoices where id = (select invoice_id from p)))
      ) x) as client,
      (select row_to_json(x) from (
        select
          inv.id::text, inv.number, inv.currency,
          inv.amount_minor::text       as amount_minor,
          inv.paid_minor::text         as paid_minor,
          inv.outstanding_minor::text  as outstanding_minor,
          inv.effective_status, inv.issued_at, inv.due_at
        from inv
      ) x) as invoice,
      coalesce((
        select json_agg(row_to_json(x) order by x.occurred_at, x.id)
        from (
          select
            s2.id::text, s2.occurred_at, s2.status, s2.provider, s2.provider_payment_id, s2.method,
            s2.amount_minor::text        as amount_minor,
            s2.balance_after_minor::text as balance_after_minor
          from siblings s2
        ) x
      ), '[]'::json) as siblings
  `);

  const row = (result.rows as Record<string, unknown>[])[0];
  const payment = row?.payment as Record<string, unknown> | null;
  if (!payment) return null;

  const client = row?.client as Record<string, unknown> | null;
  const invoice = row?.invoice as Record<string, unknown> | null;
  const siblings = (row?.siblings ?? []) as Record<string, unknown>[];

  return {
    id: String(payment.id),
    occurredAt: new Date(String(payment.occurred_at)),
    provider: String(payment.provider) as PaymentProvider,
    providerPaymentId: String(payment.provider_payment_id),
    method: payment.method ? String(payment.method) : null,
    amountMinor: toBigInt(payment.amount_minor),
    currency: String(payment.currency),
    status: String(payment.status) as PaymentStatus,
    baseAmountMinor:
      payment.base_amount_minor === null || payment.base_amount_minor === undefined
        ? null
        : toBigInt(payment.base_amount_minor),
    fxRate: payment.fx_rate ? String(payment.fx_rate) : null,
    fxAt: payment.fx_at ? new Date(String(payment.fx_at)) : null,
    isDemo: payment.is_demo === true,
    createdAt: new Date(String(payment.created_at)),
    client: client
      ? {
          id: String(client.id),
          name: String(client.name),
          email: client.email ? String(client.email) : null,
          archivedAt: client.archived_at ? new Date(String(client.archived_at)) : null,
        }
      : null,
    invoice: invoice
      ? {
          id: String(invoice.id),
          number: String(invoice.number),
          currency: String(invoice.currency),
          amountMinor: toBigInt(invoice.amount_minor),
          paidMinor: toBigInt(invoice.paid_minor),
          outstandingMinor: toBigInt(invoice.outstanding_minor),
          status: String(invoice.effective_status) as EffectiveStatus,
          issuedAt: invoice.issued_at ? new Date(String(invoice.issued_at)) : null,
          dueAt: invoice.due_at ? new Date(String(invoice.due_at)) : null,
        }
      : null,
    siblings: siblings.map((s) => ({
      id: String(s.id),
      occurredAt: new Date(String(s.occurred_at)),
      amountMinor: toBigInt(s.amount_minor),
      status: String(s.status) as PaymentStatus,
      provider: String(s.provider) as PaymentProvider,
      providerPaymentId: String(s.provider_payment_id),
      method: s.method ? String(s.method) : null,
      balanceAfterMinor: toBigInt(s.balance_after_minor),
      isThisOne: String(s.id) === String(payment.id),
    })),
  };
});

/* -------------------------------------------------------------------------- */
/* Match candidates                                                           */
/* -------------------------------------------------------------------------- */

export type MatchCandidate = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  currency: string;
  amountMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
  status: EffectiveStatus;
  issuedAt: Date | null;
  dueAt: Date | null;
  /** This invoice belongs to the client already on the payment. */
  sameClient: boolean;
  /** Settling it would take the invoice past its total. Allowed, but said out loud. */
  wouldOverpay: boolean;
  /** |outstanding − payment|, in minor units. 0 means it settles exactly. */
  amountGapMinor: bigint;
};

const MAX_CANDIDATES = 20;

/**
 * Invoices this payment could plausibly settle.
 *
 * ## Currency is a filter, not a ranking signal
 *
 * A USD payment cannot be offered against an NGN invoice at any rank. The
 * processor already refuses that link and leaves the payment for review
 * (see `process-events.ts`), and a manual flow that quietly offered the same
 * pairing would make the careful thing the processor does pointless — the
 * money would land on the wrong invoice by a different door. Converting would
 * be worse: it invents a rate nobody chose and buries an FX decision inside a
 * click labelled "Match".
 *
 * ## The ranking
 *
 *   1. Same client first. It is the strongest signal available and it is the
 *      one a person would use.
 *   2. Then amount proximity — an exact settle sorts above a near miss, which
 *      sorts above something wildly off.
 *   3. Then recency, because a payment that arrived today is far more likely to
 *      be for last week's invoice than for one from eleven months ago.
 *
 * Void invoices are excluded outright: a cancelled invoice is not a thing money
 * can be owed against. Drafts are excluded too — a draft has never been sent,
 * so nobody could have paid it, and offering one invites a match that would
 * quietly resurrect an invoice the client has never seen.
 *
 * Fully-paid invoices ARE offered, flagged `wouldOverpay`. A duplicate transfer
 * is a real event; refusing to place it leaves the payment orphaned with
 * nowhere to go, which is worse than an overpaid invoice the list already
 * renders in the refunded treatment.
 */
export const getMatchCandidates = cache(
  async (paymentId: string): Promise<MatchCandidate[]> => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId)) {
      return [];
    }

    const result = await db.execute(sql`
      with ${settledPaymentsCte},
      p as (
        select
          id,
          currency,
          amount_minor,
          occurred_at,
          coalesce(client_id, (select client_id from invoices where id = payments.invoice_id)) as client_id
        from payments
        where id = ${paymentId}::uuid
      ),
      candidates as (
        select
          i.id,
          i.number,
          i.currency,
          i.amount_minor,
          i.issued_at,
          i.due_at,
          c.id                    as client_id,
          c.name                  as client_name,
          ${settledMinorExpr}     as paid_minor,
          ${outstandingMinorExpr} as outstanding_minor,
          ${effectiveStatusExpr}  as effective_status,
          (c.id = (select client_id from p))                       as same_client,
          (${outstandingMinorExpr} < (select amount_minor from p))  as would_overpay,
          abs(${outstandingMinorExpr} - (select amount_minor from p)) as amount_gap
        from invoices i
        join clients c on c.id = i.client_id
        left join settled s on s.invoice_id = i.id
        where i.currency = (select currency from p)
          and i.status not in ('void', 'draft')
      )
      select
        id::text                  as id,
        number,
        currency,
        amount_minor::text        as amount_minor,
        paid_minor::text          as paid_minor,
        outstanding_minor::text   as outstanding_minor,
        effective_status,
        issued_at,
        due_at,
        client_id::text           as client_id,
        client_name,
        same_client,
        would_overpay,
        amount_gap::text          as amount_gap
      from candidates
      order by
        same_client desc,
        amount_gap asc,
        issued_at desc nulls last,
        number desc
      limit ${MAX_CANDIDATES}
    `);

    return (result.rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      number: String(row.number),
      clientId: String(row.client_id),
      clientName: String(row.client_name),
      currency: String(row.currency),
      amountMinor: toBigInt(row.amount_minor),
      paidMinor: toBigInt(row.paid_minor),
      outstandingMinor: toBigInt(row.outstanding_minor),
      status: String(row.effective_status) as EffectiveStatus,
      issuedAt: row.issued_at ? new Date(String(row.issued_at)) : null,
      dueAt: row.due_at ? new Date(String(row.due_at)) : null,
      sameClient: row.same_client === true,
      wouldOverpay: row.would_overpay === true,
      amountGapMinor: toBigInt(row.amount_gap),
    }));
  },
);

/** Clients offered in the manual-entry form. Active only, same rule as the invoice picker. */
export const getPayableClients = cache(
  async (): Promise<Array<{ id: string; name: string }>> => {
    const result = await db.execute(sql`
      select id::text as id, name from clients where archived_at is null order by lower(name)
    `);
    return (result.rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
    }));
  },
);

/**
 * Open invoices for one client, for the manual-entry form's invoice picker.
 *
 * Same exclusions as the match candidates and the same currency discipline —
 * the caller filters to the currency being recorded, because an invoice in
 * another currency is not something this payment can settle.
 */
export async function getOpenInvoicesForClient(
  clientId: string,
): Promise<Array<{ id: string; number: string; currency: string; outstandingMinor: bigint }>> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    return [];
  }

  const result = await db.execute(sql`
    with ${settledPaymentsCte}
    select
      i.id::text              as id,
      i.number,
      i.currency,
      ${outstandingMinorExpr}::text as outstanding_minor
    from invoices i
    left join settled s on s.invoice_id = i.id
    where i.client_id = ${clientId}::uuid
      and i.status not in ('void', 'draft')
    order by i.issued_at desc nulls last, i.number desc
  `);

  return (result.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    number: String(r.number),
    currency: String(r.currency),
    outstandingMinor: toBigInt(r.outstanding_minor),
  }));
}
