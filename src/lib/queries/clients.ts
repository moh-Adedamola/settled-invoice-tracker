import 'server-only';

import { cache } from 'react';
import { sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import type { PaymentStatus } from '@/lib/db';


import { BASE_CURRENCY } from './dashboard';
import {
  effectiveStatusExpr,
  outstandingMinorExpr,
  settledMinorExpr,
  settledPaymentsCte,
  type EffectiveStatus,
} from './invoice-status';

/* ==========================================================================
   Clients.
   ==========================================================================

   ## Money here is per-currency first

   A client can be invoiced in naira and paid in dollars. "Total invoiced" for
   them is therefore not one number, and collapsing it into one is the kind of
   arithmetic that reads as authoritative and is not. So every aggregate comes
   back as a per-currency breakdown AND a base-currency figure converted at the
   latest `fx_rates` tick, and the base figure is rendered with the `≈` the
   dashboard already uses. A converted total is indicative — what the balance is
   worth today, not what will land — and it is never shown without that mark.

   ## The status derivation is the shared one

   Outstanding per client sums `outstandingMinorExpr` over their invoices, which
   is the same predicate the dashboard, the invoice list and the invoice detail
   page use. A client page claiming a different outstanding total from the
   dashboard would be worse than either being wrong alone.
   ========================================================================== */

export const CLIENT_SORT_KEYS = ['name', 'outstanding', 'invoiced', 'activity'] as const;
export type ClientSortKey = (typeof CLIENT_SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

export const DEFAULT_CLIENT_SORT: ClientSortKey = 'name';
export const DEFAULT_CLIENT_DIRECTION: SortDirection = 'asc';
export const DEFAULT_CLIENT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function isClientSortKey(value: string): value is ClientSortKey {
  return (CLIENT_SORT_KEYS as readonly string[]).includes(value);
}

/** One currency's worth of a client's money. */
export type CurrencyTotal = {
  currency: string;
  invoicedMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
};

export type ClientListRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  archivedAt: Date | null;
  invoiceCount: number;
  /** Per currency, so nothing is added together that should not be. */
  totals: CurrencyTotal[];
  /** Indicative, at the latest rate. Null when a currency has no rate. */
  base: { currency: string; invoicedMinor: bigint; paidMinor: bigint; outstandingMinor: bigint };
  /** True when any currency could not be converted, so the base figure is short. */
  baseIncomplete: boolean;
  /** Latest invoice issue or payment, whichever is more recent. */
  lastActivityAt: Date | null;
};

export type ClientListResult = {
  rows: ClientListRow[];
  total: number;
  /** Ignoring filters — distinguishes "no clients" from "no matches". */
  unfilteredTotal: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type ClientListParams = {
  q?: string;
  /** Archived clients are out by default; this is the toggle. */
  includeArchived?: boolean;
  /** Only archived, for reviewing what was put away. */
  onlyArchived?: boolean;
  sort?: ClientSortKey;
  direction?: SortDirection;
  page?: number;
  pageSize?: number;
};

/**
 * Sort targets. A whitelist, not interpolation: `sort` arrives from a URL.
 *
 * `outstanding` and `invoiced` sort on the BASE figure, because sorting a
 * mixed-currency column any other way compares naira against dollars and calls
 * the bigger number bigger.
 */
const SORT_EXPRESSIONS: Record<ClientSortKey, SQL> = {
  name: sql`lower(a.name)`,
  outstanding: sql`a.base_outstanding_minor`,
  invoiced: sql`a.base_invoiced_minor`,
  activity: sql`a.last_activity_at`,
};

const clampPage = (page?: number) =>
  Number.isFinite(page) && (page ?? 0) > 0 ? Math.floor(page!) : 1;
const clampPageSize = (size?: number) =>
  Number.isFinite(size) && (size ?? 0) > 0
    ? Math.min(Math.floor(size!), MAX_PAGE_SIZE)
    : DEFAULT_CLIENT_PAGE_SIZE;
const toBigInt = (value: unknown): bigint =>
  value === null || value === undefined || value === '' ? 0n : BigInt(String(value));

/**
 * Per-client money, per currency, converted where a rate exists.
 *
 * The whole thing is one CTE chain rather than a query per client: with N
 * clients the obvious shape is N+1 round trips, and on neon-http every one of
 * those is its own HTTP request at its own instant.
 */
const clientAggregateCte = sql`
  ${settledPaymentsCte},
  latest_fx as (
    select distinct on (base) base, rate
    from fx_rates
    where quote = ${BASE_CURRENCY}
    order by base, fetched_at desc
  ),
  by_currency as (
    select
      i.client_id,
      i.currency,
      count(*)::int                                   as invoice_count,
      sum(i.amount_minor)                             as invoiced_minor,
      sum(${settledMinorExpr})                        as paid_minor,
      sum(
        case when i.status in ('draft', 'void') then 0
             else ${outstandingMinorExpr} end
      )                                               as outstanding_minor,
      max(coalesce(i.issued_at, i.created_at))        as last_invoice_at,

      /*
       * The base-currency figures are converted PER INVOICE and then summed,
       * not summed and then converted.
       *
       * Both are defensible in isolation and they do not agree: measured on the
       * live data, rounding once at the end gave 2,999,080,539 where the
       * dashboard's outstanding KPI gave 2,999,080,538. One kobo, and it would
       * have shown up as the client list failing to add up to the figure at the
       * top of the dashboard — which on a ledger reads as an arithmetic bug
       * rather than a rounding boundary.
       *
       * The dashboard rounds per invoice, so this does too. Agreeing with the
       * other screen matters more than being marginally more accurate than it.
       */
      sum(
        case when i.currency = ${BASE_CURRENCY} then i.amount_minor
             when f.rate is not null then round(i.amount_minor * f.rate)
             else 0 end
      )                                               as base_invoiced_minor,
      sum(
        case when i.currency = ${BASE_CURRENCY} then ${settledMinorExpr}
             when f.rate is not null then round(${settledMinorExpr} * f.rate)
             else 0 end
      )                                               as base_paid_minor,
      sum(
        case when i.status in ('draft', 'void') then 0
             when i.currency = ${BASE_CURRENCY} then ${outstandingMinorExpr}
             when f.rate is not null then round(${outstandingMinorExpr} * f.rate)
             else 0 end
      )                                               as base_outstanding_minor,

      -- Null rate means this currency cannot be expressed in the base one. It
      -- contributes 0 above and raises this flag, rather than being silently
      -- counted at 1:1.
      bool_or(f.rate is null and i.currency <> ${BASE_CURRENCY}) as unconvertible
    from invoices i
    left join settled s on s.invoice_id = i.id
    left join latest_fx f on f.base = i.currency
    group by i.client_id, i.currency
  ),
  aggregated as (
    select
      c.id,
      c.name,
      c.email,
      c.phone,
      c.archived_at,
      coalesce(sum(v.invoice_count), 0)::int             as invoice_count,
      coalesce(bool_or(v.unconvertible), false)          as base_incomplete,
      coalesce(sum(v.base_invoiced_minor), 0)::bigint    as base_invoiced_minor,
      coalesce(sum(v.base_paid_minor), 0)::bigint        as base_paid_minor,
      coalesce(sum(v.base_outstanding_minor), 0)::bigint as base_outstanding_minor,
      greatest(
        coalesce(max(v.last_invoice_at), 'epoch'::timestamptz),
        coalesce((select max(p.occurred_at) from payments p where p.client_id = c.id), 'epoch'::timestamptz)
      ) as last_activity_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'currency', v.currency,
            'invoiced', v.invoiced_minor::text,
            'paid', v.paid_minor::text,
            'outstanding', v.outstanding_minor::text
          ) order by v.currency
        ) filter (where v.currency is not null),
        '[]'::jsonb
      ) as totals
    from clients c
    left join by_currency v on v.client_id = c.id
    group by c.id, c.name, c.email, c.phone, c.archived_at
  )`;

function mapRow(row: Record<string, unknown>): ClientListRow {
  const totals = (row.totals as Record<string, unknown>[]).map((t) => ({
    currency: String(t.currency),
    invoicedMinor: toBigInt(t.invoiced),
    paidMinor: toBigInt(t.paid),
    outstandingMinor: toBigInt(t.outstanding),
  }));

  const activity = row.last_activity_at ? new Date(String(row.last_activity_at)) : null;

  return {
    id: String(row.id),
    name: String(row.name),
    email: row.email === null ? null : String(row.email),
    phone: row.phone === null ? null : String(row.phone),
    archivedAt: row.archived_at ? new Date(String(row.archived_at)) : null,
    invoiceCount: Number(row.invoice_count ?? 0),
    totals,
    base: {
      currency: BASE_CURRENCY,
      invoicedMinor: toBigInt(row.base_invoiced_minor),
      paidMinor: toBigInt(row.base_paid_minor),
      outstandingMinor: toBigInt(row.base_outstanding_minor),
    },
    baseIncomplete: row.base_incomplete === true,
    // 'epoch' is the sort floor for a client with no activity at all; it is not
    // a date anyone should see.
    lastActivityAt: activity && activity.getUTCFullYear() > 1970 ? activity : null,
  };
}

export async function listClients(
  params: ClientListParams = {},
): Promise<ClientListResult> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const sortKey =
    params.sort && isClientSortKey(params.sort) ? params.sort : DEFAULT_CLIENT_SORT;
  const direction: SortDirection =
    params.direction === 'desc' ? 'desc' : params.direction === 'asc' ? 'asc' : DEFAULT_CLIENT_DIRECTION;

  const filters: SQL[] = [sql`true`];

  if (params.onlyArchived) filters.push(sql`a.archived_at is not null`);
  else if (!params.includeArchived) filters.push(sql`a.archived_at is null`);

  const search = params.q?.trim();
  if (search) {
    // Parameterised, so `%` and `_` from a user are literal.
    const pattern = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filters.push(
      sql`(a.name ilike ${pattern} escape '\\' or coalesce(a.email, '') ilike ${pattern} escape '\\')`,
    );
  }

  const whereSql = sql.join(filters, sql` and `);
  const directionSql = direction === 'asc' ? sql`asc` : sql`desc`;

  const result = await db.execute(sql`
    with ${clientAggregateCte}
    select
      a.id::text as id, a.name, a.email, a.phone, a.archived_at,
      a.invoice_count, a.base_incomplete,
      a.base_invoiced_minor::text    as base_invoiced_minor,
      a.base_paid_minor::text        as base_paid_minor,
      a.base_outstanding_minor::text as base_outstanding_minor,
      a.last_activity_at, a.totals,
      count(*) over()::int as total_count
    from aggregated a
    where ${whereSql}
    order by ${SORT_EXPRESSIONS[sortKey]} ${directionSql} nulls last, lower(a.name) asc
    limit ${pageSize}
    offset ${(page - 1) * pageSize}
  `);

  const raw = result.rows as Record<string, unknown>[];
  const total = raw.length > 0 ? Number(raw[0]!.total_count) : 0;

  let unfilteredTotal = total;
  if (raw.length === 0) {
    const [countRow] = (
      await db.execute(sql`select count(*)::int as n from clients`)
    ).rows as Record<string, unknown>[];
    unfilteredTotal = Number(countRow?.n ?? 0);
  }

  return {
    rows: raw.map(mapRow),
    total,
    unfilteredTotal,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* -------------------------------------------------------------------------- */
/* One client                                                                 */
/* -------------------------------------------------------------------------- */

export type ClientInvoice = {
  id: string;
  number: string;
  currency: string;
  amountMinor: bigint;
  paidMinor: bigint;
  outstandingMinor: bigint;
  status: EffectiveStatus;
  issuedAt: Date | null;
  dueAt: Date | null;
  daysOverdue: number;
};

export type ClientPayment = {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  provider: string;
  providerPaymentId: string;
  amountMinor: bigint;
  currency: string;
  status: PaymentStatus;
  method: string | null;
  occurredAt: Date;
};

export type ClientDetail = ClientListRow & {
  notes: string | null;
  providerCustomerIds: Record<string, string>;
  createdAt: Date;
  invoices: ClientInvoice[];
  payments: ClientPayment[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One client with their invoices and payments, in a single statement.
 *
 * Cached for the same reason `getInvoice` is: the page reads it twice, once in
 * `generateMetadata` and once to render, and two round trips would be two
 * different instants as well as two requests.
 */
export const getClient = cache(async (id: string): Promise<ClientDetail | null> => {
  if (!UUID_PATTERN.test(id)) return null;

  const result = await db.execute(sql`
    with ${clientAggregateCte}
    select
      a.id::text as id, a.name, a.email, a.phone, a.archived_at,
      a.invoice_count, a.base_incomplete,
      a.base_invoiced_minor::text    as base_invoiced_minor,
      a.base_paid_minor::text        as base_paid_minor,
      a.base_outstanding_minor::text as base_outstanding_minor,
      a.last_activity_at, a.totals,
      c.notes, c.provider_customer_ids, c.created_at,

      (
        select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_at desc nulls last), '[]'::jsonb)
        from (
          select
            i.id::text                            as id,
            i.number                              as number,
            i.currency                            as currency,
            i.amount_minor::text                  as amount_minor,
            ${settledMinorExpr}::bigint::text     as paid_minor,
            ${outstandingMinorExpr}::bigint::text as outstanding_minor,
            ${effectiveStatusExpr}                as status,
            i.issued_at                           as issued_at,
            i.due_at                              as due_at,
            coalesce(i.issued_at, i.created_at)   as sort_at
          from invoices i
          left join settled s on s.invoice_id = i.id
          where i.client_id = c.id
        ) x
      ) as invoices,

      (
        select coalesce(jsonb_agg(to_jsonb(y) order by y.occurred_at desc), '[]'::jsonb)
        from (
          select
            p.id::text            as id,
            p.invoice_id::text    as invoice_id,
            inv.number            as invoice_number,
            p.provider::text      as provider,
            p.provider_payment_id as provider_payment_id,
            p.amount_minor::text  as amount_minor,
            p.currency            as currency,
            p.status::text        as status,
            p.method              as method,
            p.occurred_at         as occurred_at
          from payments p
          left join invoices inv on inv.id = p.invoice_id
          where p.client_id = c.id
        ) y
      ) as payments

    from clients c
    join aggregated a on a.id = c.id
    where c.id = ${id}::uuid
  `);

  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;

  const nowMs = Date.now();

  return {
    ...mapRow(row),
    notes: row.notes === null ? null : String(row.notes),
    providerCustomerIds: (row.provider_customer_ids ?? {}) as Record<string, string>,
    createdAt: new Date(String(row.created_at)),
    invoices: (row.invoices as Record<string, unknown>[]).map((i) => {
      const dueAt = i.due_at ? new Date(String(i.due_at)) : null;
      const status = String(i.status) as EffectiveStatus;
      return {
        id: String(i.id),
        number: String(i.number),
        currency: String(i.currency),
        amountMinor: toBigInt(i.amount_minor),
        paidMinor: toBigInt(i.paid_minor),
        outstandingMinor: toBigInt(i.outstanding_minor),
        status,
        issuedAt: i.issued_at ? new Date(String(i.issued_at)) : null,
        dueAt,
        daysOverdue:
          status === 'overdue' && dueAt
            ? Math.max(0, Math.floor((nowMs - dueAt.getTime()) / 86_400_000))
            : 0,
      };
    }),
    payments: (row.payments as Record<string, unknown>[]).map((p) => ({
      id: String(p.id),
      invoiceId: p.invoice_id === null ? null : String(p.invoice_id),
      invoiceNumber: p.invoice_number === null ? null : String(p.invoice_number),
      provider: String(p.provider),
      providerPaymentId: String(p.provider_payment_id),
      amountMinor: toBigInt(p.amount_minor),
      currency: String(p.currency),
      status: String(p.status) as PaymentStatus,
      method: p.method === null ? null : String(p.method),
      occurredAt: new Date(String(p.occurred_at)),
    })),
  };
});

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

export type AssignableClient = { id: string; name: string };

/**
 * Clients an invoice can be raised against.
 *
 * Two things this is NOT. It is not `getInvoiceFilterOptions`, which inner-joins
 * invoices and therefore could never offer a client who has not been billed yet
 * — the invoice form was using it, so a client created this morning could not be
 * invoiced this afternoon. And it excludes archived clients, which is the point
 * of archiving: they stop being offered while everything referencing them keeps
 * resolving.
 */
export async function getAssignableClients(): Promise<AssignableClient[]> {
  const result = await db.execute(sql`
    select id::text as id, name
    from clients
    where archived_at is null
    order by lower(name)
  `);
  return (result.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
  }));
}
