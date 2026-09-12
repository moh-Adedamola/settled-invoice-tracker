import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import {
  DEFAULT_CLIENT_DIRECTION,
  DEFAULT_CLIENT_PAGE_SIZE,
  DEFAULT_CLIENT_SORT,
  isClientSortKey,
  listClients,
  type ClientSortKey,
  type SortDirection,
} from '@/lib/queries/clients';
import {
  firstValue,
  hasActiveFilters,
  toURLSearchParams,
  type RawSearchParams,
} from '@/lib/search-params';
import { EmptyState } from '@/components/dashboard/empty-state';
import { ClientFilters } from '@/components/clients/client-filters';
import { ClientsCards } from '@/components/clients/clients-cards';
import { ClientsTable } from '@/components/clients/clients-table';
import { InvoicesPagination } from '@/components/invoices/invoices-pagination';
import { PageHeader } from '@/components/shell/page-header';
import { SkeletonBlock } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Clients · Settled' };

/** Outstanding is derived from `now()`, so this page is never cached. */
export const dynamic = 'force-dynamic';

/**
 * Signed in only. A client list is a list of real people and what they owe —
 * see the route-gating rule at the top of `@/lib/auth/guard`.
 */
const FILTER_KEYS = ['q', 'archived'];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireUser();
  const readOnly = await isReadOnly();

  const params = await searchParams;
  const query = toURLSearchParams(params);

  const q = firstValue(params.q) ?? '';
  const archived = firstValue(params.archived) ?? '';
  const rawSort = firstValue(params.sort) ?? '';
  const sort: ClientSortKey = isClientSortKey(rawSort) ? rawSort : DEFAULT_CLIENT_SORT;
  const direction: SortDirection =
    firstValue(params.dir) === 'desc' ? 'desc' : firstValue(params.dir) === 'asc' ? 'asc' : DEFAULT_CLIENT_DIRECTION;
  const page = Number.parseInt(firstValue(params.page) ?? '1', 10);

  const filtered = hasActiveFilters(query, FILTER_KEYS);

  return (
    <>
      <PageHeader
        title="Clients"
        eyebrow={readOnly ? 'Read only' : undefined}
        description="Who you invoice, what they have been billed, and what is still outstanding."
        actions={
          readOnly ? null : (
            <Link
              href="/clients/new"
              className="ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active"
            >
              New client
            </Link>
          )
        }
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        <ClientFilters selected={{ q, archived, sort, direction }} />

        <Suspense key={query.toString()} fallback={<ClientsSkeleton />}>
          <ClientList
            params={{
              q,
              includeArchived: archived === 'include',
              onlyArchived: archived === 'only',
              sort,
              direction,
              page,
              pageSize: DEFAULT_CLIENT_PAGE_SIZE,
            }}
            query={query}
            filtered={filtered}
            sort={sort}
            direction={direction}
          />
        </Suspense>
      </div>
    </>
  );
}

async function ClientList({
  params,
  query,
  filtered,
  sort,
  direction,
}: {
  params: Parameters<typeof listClients>[0];
  query: URLSearchParams;
  filtered: boolean;
  sort: ClientSortKey;
  direction: SortDirection;
}) {
  const result = await listClients(params);

  if (result.rows.length === 0) {
    return (
      <div className="rounded-md border border-line bg-surface">
        {filtered ? (
          <EmptyState
            variant="filtered"
            title="No clients match these filters."
            body={`${result.unfilteredTotal} on the books in total.`}
            action={
              <Link
                href="/clients"
                className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No clients yet"
            body="Add a client and they become available to invoice. Everything they are billed and pay collects here."
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Two renderings of one query, chosen by width in CSS so the right one
          is in the first paint. Cutover at `md`, per §8. */}
      <ClientsCards result={result} query={query} sort={sort} direction={direction} />
      <ClientsTable result={result} query={query} sort={sort} direction={direction} />
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

function ClientsSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="flex gap-6 px-4 py-2.5">
          {[110, 160, 60, 110, 100, 110].map((w, i) => (
            <SkeletonBlock key={i} className="h-3 shrink-0" style={{ width: w * 0.6 }} />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-11 items-center gap-6 border-t border-line-subtle px-4">
            {[110, 160, 60, 110, 100, 110].map((w, j) => (
              <SkeletonBlock key={j} className="h-3.5 shrink-0" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        Loading clients
      </span>
    </div>
  );
}
