import Link from 'next/link';

import type { ClientListResult, ClientSortKey } from '@/lib/queries/clients';
import { formatDateFull } from '@/lib/format';
import { patchQuery } from '@/lib/search-params';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { SortableColumn } from '@/components/ui/sortable-column';

import { MoneyStack } from './client-money';

/**
 * §7 table, §8 pinning — the same conventions as the ledger, because a client
 * list and an invoice list are read the same way.
 *
 * Name is pinned left (the row's identity) and Outstanding right (its headline
 * figure), which is §8's both-ends rule. Below `md` this gives way to stacked
 * entries, per the same measurement: four columns of identity, counterparty,
 * state and money need about 650px of viewport before one of them ends up
 * underneath a pin.
 */
const SCROLLING_COLUMNS: Array<{
  key: ClientSortKey | null;
  label: string;
  align: 'left' | 'right';
}> = [
  { key: null, label: 'Contact', align: 'left' },
  { key: null, label: 'Invoices', align: 'right' },
  { key: 'invoiced', label: 'Invoiced', align: 'right' },
  { key: 'activity', label: 'Last activity', align: 'left' },
];

export function ClientsTable({
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

  const sortHref = (key: ClientSortKey) => {
    // Names read best A–Z first; money and dates read best largest first.
    const next =
      sort === key ? (direction === 'asc' ? 'desc' : 'asc') : key === 'name' ? 'asc' : 'desc';
    return `/clients${patchQuery(query, { sort: key, dir: next })}`;
  };

  const headCell =
    'sticky top-0 z-10 bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';
  const cell = 'h-11 px-3 text-small whitespace-nowrap';

  return (
    <ScrollCue className="hidden rounded-md border border-line bg-surface md:block">
      <table className="w-full min-w-[880px] border-collapse">
        <thead>
          <tr>
            <SortableColumn
              href={sortHref('name')}
              label="Client"
              active={sort === 'name'}
              direction={direction}
              className={`${headCell} sticky left-0 z-20 px-4 text-left`}
            />
            {SCROLLING_COLUMNS.map((column) => {
              const cellClass = `${headCell} ${column.align === 'right' ? 'text-right' : 'text-left'}`;
              // A column that cannot be sorted takes no aria-sort at all — the
              // attribute means "sortable", and `none` means "not right now".
              return column.key ? (
                <SortableColumn
                  key={column.label}
                  href={sortHref(column.key)}
                  label={column.label}
                  active={sort === column.key}
                  direction={direction}
                  align={column.align}
                  className={cellClass}
                />
              ) : (
                <th key={column.label} scope="col" className={cellClass}>
                  {column.label}
                </th>
              );
            })}
            <SortableColumn
              href={sortHref('outstanding')}
              label="Outstanding"
              active={sort === 'outstanding'}
              direction={direction}
              align="right"
              className={`${headCell} sticky right-0 z-20 border-l border-line pr-5 text-right`}
            />
          </tr>
        </thead>

        <tbody>
          {result.rows.map((client) => (
            <tr
              key={client.id}
              className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
            >
              <td className="sticky left-0 z-10 h-11 bg-surface px-4 text-small whitespace-nowrap text-ink group-hover:bg-row-hover">
                <Link
                  href={`/clients/${client.id}${suffix}`}
                  className="rounded-xs underline-offset-2 hover:underline"
                >
                  {client.name}
                </Link>
                {client.archivedAt ? <ArchivedMark /> : null}
              </td>

              <td className={`${cell} text-ink-secondary`}>
                {client.email ?? <span className="text-ink-muted">—</span>}
              </td>
              <td className={`money ${cell} text-right text-ink-secondary`}>
                {client.invoiceCount > 0 ? client.invoiceCount : <span className="text-ink-muted">—</span>}
              </td>
              <td className={`${cell} py-2 text-right text-small text-ink-secondary`}>
                <MoneyStack client={client} field="invoicedMinor" />
              </td>
              <td className={`money ${cell} text-ink-muted`}>
                {client.lastActivityAt ? formatDateFull(client.lastActivityAt) : '—'}
              </td>

              <td
                data-pinned-end=""
                className="sticky right-0 z-10 h-11 border-l border-line bg-surface pr-5 pl-3 text-right text-small whitespace-nowrap text-ink group-hover:bg-row-hover"
              >
                <MoneyStack client={client} field="outstandingMinor" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollCue>
  );
}

/**
 * An archived client shown in the list is marked, not merely dimmed.
 *
 * Dimming alone would say "archived" only to someone who can compare it against
 * a row that is not — which on a list filtered to archived clients is nobody.
 * §3.3's rule: the marker travels with the colour.
 */
export function ArchivedMark() {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-xs border border-l-[3px] border-void-line border-l-void bg-void-bg px-1.5 py-0.5 text-micro font-medium uppercase text-void">
      <span aria-hidden="true" className="text-[10px] leading-none">
        —
      </span>
      Archived
    </span>
  );
}
