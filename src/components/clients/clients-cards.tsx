import Link from 'next/link';

import type { ClientListResult, ClientSortKey } from '@/lib/queries/clients';
import { formatDateFull } from '@/lib/format';
import { patchQuery } from '@/lib/search-params';

import { ArchivedMark } from './clients-table';
import { MoneyStack } from './client-money';

/**
 * The phone rendering, below `md`. §8's stacked treatment, same as the ledger:
 * one hairline-separated container, no per-entry shadows, and the figure that
 * matters flush to a shared right edge in Plex Mono with tabular figures.
 *
 * Outstanding leads here rather than Invoiced, because on a client list the
 * question is who owes you.
 */
const SORTS: { key: ClientSortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'invoiced', label: 'Invoiced' },
  { key: 'activity', label: 'Activity' },
];

export function ClientsCards({
  result,
  query,
  sort,
  direction,
}: {
  result: ClientListResult;
  query: URLSearchParams;
  sort: ClientSortKey;
  direction: 'asc' | 'desc';
}) {
  const listQuery = query.toString();
  const suffix = listQuery ? `?back=${encodeURIComponent(listQuery)}` : '';

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <div className="flex items-center gap-2 overflow-x-auto px-0.5 pb-0.5">
        <span className="shrink-0 text-micro uppercase text-ink-muted">Sort</span>
        {SORTS.map(({ key, label }) => {
          const active = sort === key;
          const next = active
            ? direction === 'asc'
              ? 'desc'
              : 'asc'
            : key === 'name'
              ? 'asc'
              : 'desc';
          return (
            <Link
              key={key}
              href={`/clients${patchQuery(query, { sort: key, dir: next })}`}
              aria-current={active ? 'true' : undefined}
              className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-xs px-1 text-small whitespace-nowrap ${
                active
                  ? 'text-ink underline decoration-accent decoration-2 underline-offset-[6px]'
                  : 'text-ink-secondary'
              }`}
            >
              {label}
              {active ? (
                <span aria-hidden="true" className="text-accent">
                  {direction === 'asc' ? '↑' : '↓'}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>

      <ul className="overflow-hidden rounded-md border border-line bg-surface">
        {result.rows.map((client) => (
          <li key={client.id} className="border-t border-line-subtle first:border-t-0">
            <Link
              href={`/clients/${client.id}${suffix}`}
              className="flex flex-col gap-1.5 px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-small text-ink">{client.name}</span>
                {client.archivedAt ? <ArchivedMark /> : null}
              </div>

              {client.email ? (
                <p className="money text-micro text-ink-muted">{client.email}</p>
              ) : null}

              <div className="flex items-baseline justify-between gap-3">
                <span className="text-micro text-ink-muted">
                  {client.invoiceCount > 0 ? (
                    <>
                      <span className="money">{client.invoiceCount}</span>{' '}
                      {client.invoiceCount === 1 ? 'invoice' : 'invoices'}
                    </>
                  ) : (
                    'No invoices yet'
                  )}
                  {client.lastActivityAt ? (
                    <> · {formatDateFull(client.lastActivityAt)}</>
                  ) : null}
                </span>
                <span data-card-amount="" className="shrink-0 text-small text-ink">
                  <MoneyStack client={client} field="outstandingMinor" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
