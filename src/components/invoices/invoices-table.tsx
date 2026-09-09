import Link from 'next/link';

import type { InvoiceListResult, InvoiceListRow, SortKey } from '@/lib/queries/invoices';
import { currencySymbol, formatDateFull, formatMinorDigits } from '@/lib/format';
import { patchQuery } from '@/lib/search-params';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { StatusBadge, invoiceStatusKey } from '@/components/ui/status-badge';

/**
 * §7 table: 44px rows, hairline rules, no zebra, sticky header, --row-hover.
 * §8 narrow screens: horizontal scroll with the invoice number pinned.
 *
 * Status comes from the shared derivation in `invoice-status.ts`, so a row
 * here says the same thing the dashboard says about the same invoice.
 */
const COLUMNS: Array<{
  key: SortKey | null;
  label: string;
  align: 'left' | 'right';
}> = [
  { key: 'issued', label: 'Issued', align: 'left' },
  { key: 'due', label: 'Due', align: 'left' },
  { key: null, label: 'Days over', align: 'right' },
  { key: null, label: 'Paid', align: 'right' },
  { key: 'amount', label: 'Amount', align: 'right' },
];

export function InvoicesTable({
  result,
  query,
  sort,
  direction,
}: {
  result: InvoiceListResult;
  query: URLSearchParams;
  sort: SortKey;
  direction: 'asc' | 'desc';
}) {
  const sortHref = (key: SortKey) => {
    // Clicking the active column flips it; a new column starts descending for
    // dates and amounts, ascending for names — which is what each reads as
    // "most useful first".
    const nextDirection =
      sort === key ? (direction === 'asc' ? 'desc' : 'asc') : key === 'client' ? 'asc' : 'desc';
    return `/invoices${patchQuery(query, { sort: key, dir: nextDirection })}`;
  };

  const headCell =
    'sticky top-0 z-10 bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';

  return (
    <ScrollCue className="rounded-md border border-line bg-surface">
      <table className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr>
            {/* Not sortable: invoice numbers already sort by issue date, and
                two ways to ask the same question is one too many. */}
            <th scope="col" className={`${headCell} sticky left-0 z-20 px-4 text-left`}>
              Invoice
            </th>
            <th scope="col" className={`${headCell} text-left`}>
              <SortLink
                href={sortHref('client')}
                label="Client"
                active={sort === 'client'}
                direction={direction}
              />
            </th>
            <th scope="col" className={`${headCell} text-left`}>
              <SortLink
                href={sortHref('status')}
                label="Status"
                active={sort === 'status'}
                direction={direction}
              />
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`${headCell} ${column.align === 'right' ? 'text-right last:pr-5' : 'text-left'}`}
              >
                {column.key ? (
                  <SortLink
                    href={sortHref(column.key)}
                    label={column.label}
                    active={sort === column.key}
                    direction={direction}
                    align={column.align}
                  />
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {result.rows.map((invoice) => (
            <tr
              key={invoice.id}
              className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
            >
              {/* Pinned: needs its own opaque ground or scrolled cells show
                  through, and repeats the hover so the row reads as one.
                  whitespace-nowrap is load-bearing — see §7. */}
              <td className="money sticky left-0 z-10 h-11 bg-surface px-4 text-small whitespace-nowrap text-ink group-hover:bg-row-hover">
                <Link
                  href={`/invoices/${invoice.id}`}
                  className="rounded-xs underline-offset-2 hover:underline"
                >
                  {invoice.number}
                </Link>
              </td>
              <td className="h-11 px-3 text-small whitespace-nowrap text-ink">
                {invoice.clientName}
              </td>
              <td className="h-11 px-3">
                <StatusBadge {...toBadge(invoice.status)} />
              </td>
              <td className="money h-11 px-3 text-small whitespace-nowrap text-ink-muted">
                {invoice.issuedAt ? formatDateFull(invoice.issuedAt) : '—'}
              </td>
              <td className="money h-11 px-3 text-small whitespace-nowrap text-ink-muted">
                {invoice.dueAt ? formatDateFull(invoice.dueAt) : '—'}
              </td>
              <td className="money h-11 px-3 text-right text-small whitespace-nowrap">
                {invoice.daysOverdue > 0 ? (
                  <span className="text-overdue">{invoice.daysOverdue}</span>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </td>
              <td className="money h-11 px-3 text-right text-small whitespace-nowrap text-ink-secondary">
                {invoice.paidMinor > 0n ? (
                  <>
                    <span className="currency-mark">{currencySymbol(invoice.currency)}</span>
                    {formatMinorDigits(invoice.paidMinor)}
                  </>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </td>
              <td className="money h-11 pr-5 pl-3 text-right text-small whitespace-nowrap text-ink">
                <span className="currency-mark">{currencySymbol(invoice.currency)}</span>
                {formatMinorDigits(invoice.amountMinor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollCue>
  );
}

/**
 * The list's derived status is one of six invoice states; the badge speaks in
 * eight presentation states. `invoiceStatusKey` is the only crossing between
 * them, so the list and the dashboard label the same invoice identically.
 */
function toBadge(status: InvoiceListRow['status']) {
  const { key, label } = invoiceStatusKey(status);
  return { status: key, label } as const;
}

function SortLink({
  href,
  label,
  active,
  direction,
  align = 'left',
}: {
  href: string;
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  align?: 'left' | 'right';
}) {
  return (
    <Link
      href={href}
      // §7: the active column is marked with a copper underline, not an icon swap.
      className={`inline-flex items-center gap-1 rounded-xs ${
        align === 'right' ? 'flex-row-reverse' : ''
      } ${
        active
          ? 'text-ink underline decoration-accent decoration-2 underline-offset-[6px]'
          : 'hover:text-ink'
      }`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span aria-hidden="true" className={active ? 'text-accent' : 'text-transparent'}>
        {active && direction === 'asc' ? '↑' : '↓'}
      </span>
    </Link>
  );
}
