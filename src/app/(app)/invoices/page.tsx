import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import {
  DEFAULT_DIRECTION,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  getInvoiceFilterOptions,
  isSortKey,
  listInvoices,
  type SortDirection,
  type SortKey,
} from '@/lib/queries/invoices';
import {
  EFFECTIVE_STATUSES,
  type EffectiveStatus,
} from '@/lib/queries/invoice-status';
import {
  allValues,
  firstValue,
  hasActiveFilters,
  toURLSearchParams,
  type RawSearchParams,
} from '@/lib/search-params';
import { EmptyState } from '@/components/dashboard/empty-state';
import { InvoiceCards } from '@/components/invoices/invoice-cards';
import { InvoiceFilters } from '@/components/invoices/invoice-filters';
import { InvoicesPagination } from '@/components/invoices/invoices-pagination';
import { InvoicesTable } from '@/components/invoices/invoices-table';
import { InvoicesTableSkeleton } from '@/components/invoices/invoices-skeleton';
import { PageHeader } from '@/components/shell/page-header';

export const metadata: Metadata = { title: 'Invoices · Settled' };

/**
 * The ledger reads live: an invoice that fell overdue an hour ago must show as
 * overdue now, and every derived figure on this page depends on `now()`.
 */
export const dynamic = 'force-dynamic';

/**
 * Signed in only. The ledger names real clients and real sums, and a client who
 * engaged the agency did not agree to appear on a public page — see the rule
 * in `@/lib/auth/guard`, which covers `/payments` and `/clients` too. `/demo`
 * remains the public surface, on the strength of the nightly reset.
 *
 * Admission and affordances are separate questions. `requireUser()` decides who
 * gets in; `isReadOnly()` decides what a viewer sees once inside, and is
 * presentation only — every future mutation still calls `assertCanWrite` on the
 * server. Nothing renders behind it yet because nothing here writes; it is read
 * now so the seam exists where the create and void controls will land.
 */

/** Keys that narrow the result set — sort and page are not filters. */
const FILTER_KEYS = ['status', 'client', 'currency', 'from', 'to', 'q'];

const isEffectiveStatus = (value: string): value is EffectiveStatus =>
  (EFFECTIVE_STATUSES as readonly string[]).includes(value);

/** YYYY-MM-DD only. Anything else is dropped rather than sent to a date cast. */
const asDate = (value: string | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireUser();
  const readOnly = await isReadOnly();

  // Next 16: searchParams is a promise, and it is the only state this page has.
  const params = await searchParams;
  const query = toURLSearchParams(params);

  const status = allValues(params.status).filter(isEffectiveStatus);
  const clientId = firstValue(params.client) ?? '';
  const currency = firstValue(params.currency) ?? '';
  const issuedFrom = asDate(firstValue(params.from));
  const issuedTo = asDate(firstValue(params.to));
  const q = firstValue(params.q) ?? '';

  const rawSort = firstValue(params.sort) ?? '';
  const sort: SortKey = isSortKey(rawSort) ? rawSort : DEFAULT_SORT;
  const direction: SortDirection =
    firstValue(params.dir) === 'asc' ? 'asc' : DEFAULT_DIRECTION;
  const page = Number.parseInt(firstValue(params.page) ?? '1', 10);

  const filtered = hasActiveFilters(query, FILTER_KEYS);

  // Suspense boundaries stream around the two reads independently, so the
  // filter bar paints from the cheap query while the ledger is still counting.
  return (
    <>
      {/* Until the create/void controls exist, the only thing read-only
          changes is that the header says so — `/demo` uses the same slot. */}
      <PageHeader
        title="Invoices"
        eyebrow={readOnly ? 'Read only' : undefined}
        description="Every invoice on the books, with what has actually been paid against it."
        actions={
          readOnly ? null : (
            <Link
              href="/invoices/new"
              className="ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active"
            >
              New invoice
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        <Suspense fallback={<FiltersSkeleton />}>
          <Filters
            selected={{
              status,
              clientId,
              currency,
              issuedFrom,
              issuedTo,
              q,
              sort,
              direction,
            }}
          />
        </Suspense>

        <Suspense
          // Re-suspends on every filter change, rather than holding the old
          // rows while the new ones load. The key is the whole query.
          key={query.toString()}
          fallback={<InvoicesTableSkeleton />}
        >
          <InvoiceList
            params={{
              status,
              clientId,
              currency,
              issuedFrom,
              issuedTo,
              q,
              sort,
              direction,
              page,
              pageSize: DEFAULT_PAGE_SIZE,
            }}
            query={query}
            filtered={filtered}
          />
        </Suspense>
      </div>
    </>
  );
}

async function Filters({
  selected,
}: {
  selected: React.ComponentProps<typeof InvoiceFilters>['selected'];
}) {
  const options = await getInvoiceFilterOptions();
  return <InvoiceFilters options={options} selected={selected} />;
}

async function InvoiceList({
  params,
  query,
  filtered,
}: {
  params: Parameters<typeof listInvoices>[0];
  query: URLSearchParams;
  filtered: boolean;
}) {
  const result = await listInvoices(params);

  if (result.rows.length === 0) {
    // Two different facts with two different next actions: an empty ledger
    // needs an invoice, an empty filter needs the filter removed.
    return (
      <div className="rounded-md border border-line bg-surface">
        {filtered ? (
          <EmptyState
            variant="filtered"
            title="No invoices match these filters."
            body={`${result.unfilteredTotal} on the books in total.`}
            action={
              <Link
                href="/invoices"
                className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No invoices yet"
            body="Invoices appear here once they are raised, along with every payment recorded against them."
          />
        )}
      </div>
    );
  }

  const sort = params?.sort ?? DEFAULT_SORT;
  const direction = params?.direction ?? DEFAULT_DIRECTION;

  return (
    <div className="flex flex-col gap-4">
      {/*
        Two renderings of one query, chosen by width in CSS rather than by
        measuring the client, so the correct one is in the first paint.
        The cutover is `md` — below it the table cannot show the invoice number,
        client, status and amount without one of them falling under a pinned
        column. See the note in invoice-cards.tsx for the measurements.
      */}
      <div className="md:hidden">
        <InvoiceCards result={result} query={query} sort={sort} direction={direction} />
      </div>
      <div className="hidden md:block">
        <InvoicesTable result={result} query={query} sort={sort} direction={direction} />
      </div>
      <InvoicesPagination
        page={result.page}
        pageCount={result.pageCount}
        pageSize={result.pageSize}
        total={result.total}
        query={query}
      />
    </div>
  );
}

/** Matches the filter bar's box so the page does not jump when it resolves. */
function FiltersSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[186px] rounded-md border border-line bg-surface-raised"
    />
  );
}
