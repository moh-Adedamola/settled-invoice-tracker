import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import {
  DEFAULT_DIRECTION,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  getPaymentFilterOptions,
  isPaymentProvider,
  isPaymentSortKey,
  isPaymentStatus,
  listPayments,
  type PaymentSortKey,
  type SortDirection,
} from '@/lib/queries/payments';
import {
  allValues,
  firstValue,
  hasActiveFilters,
  toURLSearchParams,
  type RawSearchParams,
} from '@/lib/search-params';
import { EmptyState } from '@/components/dashboard/empty-state';
import { PageHeader } from '@/components/shell/page-header';
import { PaymentFilters } from '@/components/payments/payment-filters';
import { PaymentsCards } from '@/components/payments/payments-cards';
import { PaymentsTable } from '@/components/payments/payments-table';
import { Pagination } from '@/components/ui/pagination';
import { InvoicesTableSkeleton } from '@/components/invoices/invoices-skeleton';

export const metadata: Metadata = { title: 'Payments · Settled' };

/** Every figure here is derived from `now()` and from live payment rows. */
export const dynamic = 'force-dynamic';

/**
 * Signed in only — the route rule in `@/lib/auth/guard` covers this page by
 * name. A payment names a client and a sum; `/demo` is the public surface.
 *
 * `requireUser()` decides admission, `isReadOnly()` decides affordances. Every
 * action still calls `assertCanWrite()` on the server: hiding a control is not
 * an authorisation check.
 */

const FILTER_KEYS = ['status', 'provider', 'currency', 'from', 'to', 'unmatched', 'q'];

const asDate = (value: string | undefined) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireUser();
  const readOnly = await isReadOnly();

  const params = await searchParams;
  const query = toURLSearchParams(params);

  const status = allValues(params.status).filter(isPaymentStatus);
  const provider = allValues(params.provider).filter(isPaymentProvider);
  const currency = firstValue(params.currency) ?? '';
  const from = asDate(firstValue(params.from));
  const to = asDate(firstValue(params.to));
  const unmatched = firstValue(params.unmatched) === '1';
  const q = firstValue(params.q) ?? '';

  const rawSort = firstValue(params.sort) ?? '';
  const sort: PaymentSortKey = isPaymentSortKey(rawSort) ? rawSort : DEFAULT_SORT;
  const direction: SortDirection =
    firstValue(params.dir) === 'asc' ? 'asc' : DEFAULT_DIRECTION;
  const page = Number.parseInt(firstValue(params.page) ?? '1', 10);

  const filtered = hasActiveFilters(query, FILTER_KEYS);

  return (
    <>
      <PageHeader
        title="Payments"
        eyebrow={readOnly ? 'Read only' : undefined}
        description="Every payment recorded, matched or not, with what it settled."
        actions={
          readOnly ? null : (
            <Link
              href="/payments/new"
              className="ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active"
            >
              Record a payment
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        <Suspense fallback={<FiltersSkeleton />}>
          <Filters
            selected={{ status, provider, currency, from, to, unmatched, q, sort, direction }}
          />
        </Suspense>

        <Suspense key={query.toString()} fallback={<InvoicesTableSkeleton />}>
          <PaymentList
            params={{
              status,
              provider,
              currency,
              from,
              to,
              unmatchedOnly: unmatched,
              q,
              sort,
              direction,
              page,
              pageSize: DEFAULT_PAGE_SIZE,
            }}
            query={query}
            filtered={filtered}
            unmatchedFilterOn={unmatched}
          />
        </Suspense>
      </div>
    </>
  );
}

async function Filters({
  selected,
}: {
  selected: React.ComponentProps<typeof PaymentFilters>['selected'];
}) {
  const options = await getPaymentFilterOptions();
  return <PaymentFilters options={options} selected={selected} />;
}

async function PaymentList({
  params,
  query,
  filtered,
  unmatchedFilterOn,
}: {
  params: Parameters<typeof listPayments>[0];
  query: URLSearchParams;
  filtered: boolean;
  unmatchedFilterOn: boolean;
}) {
  const result = await listPayments(params);

  if (result.rows.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface">
        {filtered ? (
          <EmptyState
            variant="filtered"
            title="No payments match these filters."
            body={`${result.unfilteredTotal} recorded in total.`}
            action={
              <Link
                href="/payments"
                className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No payments yet"
            body="Payments appear here as gateways report them, and whenever one is recorded by hand."
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
        The queue banner.

        The brief for this page is "what needs action", and the thing needing
        action is money no invoice claims. A count that only appears once you
        filter for it is a count nobody sees, so it sits above the list
        unconditionally and links to the filtered view — and it is absent, not
        zeroed, when the queue is empty, because a standing "0 unmatched" is
        furniture people stop reading.
      */}
      {result.unmatchedTotal > 0 && !unmatchedFilterOn ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border border-pending-line border-l-[3px] border-l-pending bg-pending-bg px-3 py-2.5 text-small text-pending">
          <span aria-hidden="true" className="text-[10px] leading-none">
            ◐
          </span>
          <span>
            <span className="money font-medium">{result.unmatchedTotal}</span>{' '}
            {result.unmatchedTotal === 1 ? 'payment has' : 'payments have'} arrived
            that no invoice claims.
          </span>
          <Link
            href="/payments?unmatched=1"
            className="rounded-xs underline underline-offset-2 hover:text-ink"
          >
            Show only those
          </Link>
        </p>
      ) : null}

      {/* Two renderings of one query, chosen by width in CSS so the correct one
          is in the first paint. §8's `md` cutover. */}
      <div className="md:hidden">
        <PaymentsCards result={result} query={query} sort={sort} direction={direction} />
      </div>
      <div className="hidden md:block">
        <PaymentsTable result={result} query={query} sort={sort} direction={direction} />
      </div>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        pageSize={result.pageSize}
        total={result.total}
        query={query}
        basePath="/payments"
        label="Payment pages"
      />
    </div>
  );
}

function FiltersSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[232px] rounded-md border border-line bg-surface-raised"
    />
  );
}
