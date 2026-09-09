import Link from 'next/link';

import { patchQuery } from '@/lib/search-params';

/**
 * §7 pagination: 32px targets, mono numerals, current page marked with a
 * copper underline rather than a filled pill. Server-side paging — the full
 * ledger is never shipped to the browser.
 */
export function InvoicesPagination({
  page,
  pageCount,
  pageSize,
  total,
  query,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  query: URLSearchParams;
}) {
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const href = (target: number) =>
    `/invoices${patchQuery(query, { page: target === 1 ? null : String(target) }, { resetPage: false })}`;

  const step =
    'inline-flex h-8 items-center rounded-sm border border-line-strong px-3 text-small transition-colors duration-[var(--duration-fast)] ease-standard';

  // Numbered pages only while they fit on one line; past that the numbers stop
  // being a useful way to navigate and prev/next carries it.
  const numbered = pageCount <= 9;

  return (
    <nav
      aria-label="Invoice pages"
      className="flex flex-wrap items-center justify-between gap-3 px-1"
    >
      <p className="text-small text-ink-muted">
        Showing <span className="money">{first}</span>–<span className="money">{last}</span> of{' '}
        <span className="money">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className={`${step} text-ink hover:bg-row-hover`} rel="prev">
            Previous
          </Link>
        ) : (
          <span className={`${step} cursor-not-allowed text-ink-muted opacity-40`} aria-disabled="true">
            Previous
          </span>
        )}

        {numbered
          ? Array.from({ length: pageCount }, (_, i) => i + 1).map((n) =>
              n === page ? (
                <span
                  key={n}
                  aria-current="page"
                  className="money inline-flex h-8 items-center px-2.5 text-small text-ink underline decoration-accent decoration-2 underline-offset-[6px]"
                >
                  {n}
                </span>
              ) : (
                <Link
                  key={n}
                  href={href(n)}
                  className="money inline-flex h-8 items-center rounded-sm px-2.5 text-small text-ink-secondary transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover hover:text-ink"
                >
                  {n}
                </Link>
              ),
            )
          : (
              <span className="money px-2 text-small text-ink-muted">
                {page} / {pageCount}
              </span>
            )}

        {page < pageCount ? (
          <Link href={href(page + 1)} className={`${step} text-ink hover:bg-row-hover`} rel="next">
            Next
          </Link>
        ) : (
          <span className={`${step} cursor-not-allowed text-ink-muted opacity-40`} aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
