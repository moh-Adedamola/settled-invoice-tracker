import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { BUSINESS_TIMEZONE } from '@/lib/business-timezone';

import {
  daysOverdueExpr,
  effectiveStatusExpr,
  outstandingMinorExpr,
  settledMinorExpr,
  settledPaymentsCte,
  type EffectiveStatus,
} from './invoice-status';

/* ==========================================================================
   Invoice list.
   ==========================================================================

   Status, outstanding and days-overdue all come from `./invoice-status.ts`,
   the same fragments the dashboard uses. That is not tidiness: this screen and
   the dashboard are read side by side, and a list showing six overdue invoices
   under a KPI tile claiming seven is worse than either being wrong alone.

   PAGINATION: offset, not cursor.

   Keyset pagination scales better and it is the right answer for an infinite
   feed. This is not one. Three things push the other way:

   - The UI needs a total and page numbers ("241 invoices, page 3 of 13").
     A keyset cursor cannot produce either without a separate count anyway.
   - Sort is user-selectable across five columns in both directions. A keyset
     cursor needs a tuple per sort key plus a unique tiebreaker, so that is
     five bespoke cursor encodings to get wrong.
   - An invoice ledger is bounded by how much work a business actually did.
     One agency generates thousands of invoices over its life, not millions.

   Where it breaks: `OFFSET n` makes Postgres walk and discard n rows, so deep
   pages get linearly slower. At this size that is unmeasurable; if this ledger
   ever reaches a scale where page 500 is a real request, the fix is keyset on
   `(issued_at, id)` for the default sort and dropping arbitrary page jumps.
   ========================================================================== */

export const SORT_KEYS = ['issued', 'due', 'amount', 'client', 'status'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

export const DEFAULT_SORT: SortKey = 'issued';
export const DEFAULT_DIRECTION: SortDirection = 'desc';
export const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

export type InvoiceListParams = {
  status?: EffectiveStatus[];
  clientId?: string;
  currency?: string;
  /** YYYY-MM-DD, interpreted as business-timezone calendar days. */
  issuedFrom?: string;
  issuedTo?: string;
  /** Matches invoice number or client name. */
  q?: string;
  sort?: SortKey;
  direction?: SortDirection;
  page?: number;
  pageSize?: number;
};

export type InvoiceListRow = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  currency: string;
  amountMinor: bigint;
  /** Sum of succeeded payments against this invoice. */
  paidMinor: bigint;
  outstandingMinor: bigint;
  status: EffectiveStatus;
  /** What the column literally says — kept so a stale row is visible, not hidden. */
  storedStatus: string;
  issuedAt: Date | null;
  dueAt: Date | null;
  daysOverdue: number;
};

export type InvoiceListResult = {
  rows: InvoiceListRow[];
  total: number;
  /** Total ignoring filters — distinguishes "no invoices" from "no matches". */
  unfilteredTotal: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * Sort targets. A whitelist, not string interpolation: `sort` arrives from a
 * URL and anything not in this map never reaches SQL.
 *
 * `status` sorts by urgency rather than alphabetically. Someone sorting a
 * ledger by status is asking "what needs attention", and an alphabetical run
 * of draft/overdue/paid/partial answers a question nobody asked.
 */
const SORT_EXPRESSIONS: Record<SortKey, SQL> = {
  issued: sql`e.issued_at`,
  due: sql`e.due_at`,
  amount: sql`e.amount_minor`,
  client: sql`lower(e.client_name)`,
  status: sql`case e.effective_status
    when 'overdue' then 0
    when 'partial' then 1
    when 'sent'    then 2
    when 'draft'   then 3
    when 'paid'    then 4
    when 'void'    then 5
    else 6 end`,
};

const clampPage = (page?: number) =>
  Number.isFinite(page) && (page ?? 0) > 0 ? Math.floor(page!) : 1;

const clampPageSize = (size?: number) =>
  Number.isFinite(size) && (size ?? 0) > 0
    ? Math.min(Math.floor(size!), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

const toBigInt = (value: unknown): bigint =>
  value === null || value === undefined || value === '' ? 0n : BigInt(String(value));

/**
 * One query. Rows, the filtered total and the derived status all come back
 * together — no N+1 for payment sums, no second round trip for the count.
 *
 * `count(*) over()` rides along on every row, which is how the total survives
 * the LIMIT without a separate aggregate pass.
 */
export async function listInvoices(
  params: InvoiceListParams = {},
): Promise<InvoiceListResult> {
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const sortKey = params.sort && isSortKey(params.sort) ? params.sort : DEFAULT_SORT;
  const direction: SortDirection = params.direction === 'asc' ? 'asc' : DEFAULT_DIRECTION;

  const filters: SQL[] = [sql`true`];

  if (params.status && params.status.length > 0) {
    filters.push(
      sql`e.effective_status in (${sql.join(
        params.status.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  if (params.clientId) filters.push(sql`e.client_id = ${params.clientId}::uuid`);
  if (params.currency) filters.push(sql`e.currency = ${params.currency}`);

  // Date filters compare business-timezone calendar days, matching how the
  // dates are displayed. Comparing raw timestamps would put a 23:30 Lagos
  // invoice on the previous day for anyone filtering by what they can see.
  if (params.issuedFrom) {
    filters.push(
      sql`(e.issued_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date >= ${params.issuedFrom}::date`,
    );
  }
  if (params.issuedTo) {
    filters.push(
      sql`(e.issued_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date <= ${params.issuedTo}::date`,
    );
  }

  const search = params.q?.trim();
  if (search) {
    // Parameterised, so `%` and `_` from a user are literal rather than
    // wildcards they did not ask for.
    const pattern = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filters.push(
      sql`(e.number ilike ${pattern} escape '\\' or e.client_name ilike ${pattern} escape '\\')`,
    );
  }

  const whereSql = sql.join(filters, sql` and `);
  const orderSql = SORT_EXPRESSIONS[sortKey];
  const directionSql = direction === 'asc' ? sql`asc` : sql`desc`;

  const result = await db.execute(sql`
    with ${settledPaymentsCte},
    e as (
      select
        i.id,
        i.number,
        i.currency,
        i.amount_minor,
        i.issued_at,
        i.due_at,
        i.status                              as stored_status,
        c.id                                  as client_id,
        c.name                                as client_name,
        ${settledMinorExpr}                   as paid_minor,
        ${outstandingMinorExpr}               as outstanding_minor,
        ${effectiveStatusExpr}                as effective_status,
        ${daysOverdueExpr(BUSINESS_TIMEZONE)} as days_overdue
      from invoices i
      join clients c on c.id = i.client_id
      left join settled s on s.invoice_id = i.id
    )
    select
      e.id::text,
      e.number,
      e.currency,
      e.amount_minor::text      as amount_minor,
      e.paid_minor::text        as paid_minor,
      e.outstanding_minor::text as outstanding_minor,
      e.issued_at,
      e.due_at,
      e.stored_status,
      e.client_id::text         as client_id,
      e.client_name,
      e.effective_status,
      e.days_overdue,
      count(*) over()::int      as total_count
    from e
    where ${whereSql}
    -- nulls last in both directions: a draft with no issue date belongs at the
    -- end of the ledger, not floating at the top of a descending sort.
    order by ${orderSql} ${directionSql} nulls last, e.number desc
    limit ${pageSize}
    offset ${(page - 1) * pageSize}
  `);

  const raw = result.rows as Record<string, unknown>[];

  const rows: InvoiceListRow[] = raw.map((row) => ({
    id: String(row.id),
    number: String(row.number),
    clientId: String(row.client_id),
    clientName: String(row.client_name),
    currency: String(row.currency),
    amountMinor: toBigInt(row.amount_minor),
    paidMinor: toBigInt(row.paid_minor),
    outstandingMinor: toBigInt(row.outstanding_minor),
    status: String(row.effective_status) as EffectiveStatus,
    storedStatus: String(row.stored_status),
    issuedAt: row.issued_at ? new Date(String(row.issued_at)) : null,
    dueAt: row.due_at ? new Date(String(row.due_at)) : null,
    daysOverdue: Number(row.days_overdue ?? 0),
  }));

  const total = raw.length > 0 ? Number(raw[0]!.total_count) : 0;

  /**
   * Only when nothing matched. An empty result cannot carry `count(*) over()`,
   * and the page needs to tell "you have no invoices" apart from "no invoice
   * matches these filters" — two different screens with two different actions.
   */
  let unfilteredTotal = total;
  if (raw.length === 0) {
    const [countRow] = (
      await db.execute(sql`select count(*)::int as n from invoices`)
    ).rows as Record<string, unknown>[];
    unfilteredTotal = Number(countRow?.n ?? 0);
  }

  return {
    rows,
    total,
    unfilteredTotal,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type InvoiceFilterOptions = {
  clients: Array<{ id: string; name: string }>;
  currencies: string[];
};

/** Populates the filter controls from what is actually in the ledger. */
export async function getInvoiceFilterOptions(): Promise<InvoiceFilterOptions> {
  const [clientRows, currencyRows] = await Promise.all([
    db.execute(sql`
      select distinct c.id::text as id, c.name
      from clients c
      join invoices i on i.client_id = c.id
      order by c.name
    `),
    db.execute(sql`select distinct currency from invoices order by currency`),
  ]);

  return {
    clients: (clientRows.rows as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      name: String(r.name),
    })),
    currencies: (currencyRows.rows as Record<string, unknown>[]).map((r) =>
      String(r.currency),
    ),
  };
}
