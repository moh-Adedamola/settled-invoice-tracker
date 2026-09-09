import Link from 'next/link';

import type { InvoiceListResult, InvoiceListRow, SortKey } from '@/lib/queries/invoices';
import { currencySymbol, formatDateFull, formatMinorDigits } from '@/lib/format';
import { patchQuery } from '@/lib/search-params';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { StatusBadge, invoiceStatusKey } from '@/components/ui/status-badge';

/**
 * §7 table: 44px rows, hairline rules, no zebra, sticky header, --row-hover.
 * §8 narrow screens: horizontal scroll between two pinned columns.
 *
 * Status comes from the shared derivation in `invoice-status.ts`, so a row
 * here says the same thing the dashboard says about the same invoice.
 *
 * ## Both ends are pinned, and why
 *
 * Measured: the table's own min-content width is 1080px — Invoice 150 ·
 * Client 185 · Status 118 · Issued 124 · Due 124 · Days over 94 · Paid 139 ·
 * Amount 147. The `min-w-[900px]` floor sits below that and never binds. The
 * scroll container gets 1127px at a 1440px viewport, so the table fits, but
 * only just; at 1280px it gets 967px and overflows by 117px. Amount is last in
 * document order, so the 117px that falls off the right edge is exactly the
 * amount — the reader sees `₦2,445,000.` and has to scroll to find out what the
 * invoice is worth.
 *
 * No width tuning fixes that. The columns are not overallocated — at 1440px
 * every one already carries 20-50px of slack over its content — and 1080px of
 * min-content will always exceed some viewport. The only thing that makes the
 * figure unloseable is anchoring it, so Amount is pinned right the way the
 * invoice number is pinned left. The two anchors are the row's identity and the
 * row's headline; the middle columns scroll between them.
 */
const SCROLLING_COLUMNS: Array<{
  key: SortKey | null;
  label: string;
  align: 'left' | 'right';
}> = [
  { key: 'issued', label: 'Issued', align: 'left' },
  { key: 'due', label: 'Due', align: 'left' },
  { key: null, label: 'Days over', align: 'right' },
  { key: null, label: 'Paid', align: 'right' },
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
  const bodyCell = 'h-11 px-3 text-small whitespace-nowrap';

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
            {SCROLLING_COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`${headCell} ${column.align === 'right' ? 'text-right' : 'text-left'}`}
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
            <th
              scope="col"
              className={`${headCell} sticky right-0 z-20 border-l border-line pr-5 text-right`}
            >
              <SortLink
                href={sortHref('amount')}
                label="Amount"
                active={sort === 'amount'}
                direction={direction}
                align="right"
              />
            </th>
          </tr>
        </thead>

        <tbody>
          {result.rows.map((invoice) => {
            const badge = invoiceStatusKey(invoice.status);
            return (
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
                <td className={`${bodyCell} text-ink`}>{invoice.clientName}</td>
                <td className="h-11 px-3">
                  <StatusBadge status={badge.key} label={badge.label} />
                </td>
                <td className={`money ${bodyCell} text-ink-muted`}>
                  {invoice.issuedAt ? formatDateFull(invoice.issuedAt) : '—'}
                </td>
                <td className={`money ${bodyCell} text-ink-muted`}>
                  {invoice.dueAt ? formatDateFull(invoice.dueAt) : '—'}
                </td>
                <td className={`money ${bodyCell} text-right`}>
                  {invoice.daysOverdue > 0 ? (
                    <span className="text-overdue">{invoice.daysOverdue}</span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td className={`money ${bodyCell} text-right text-ink-secondary`}>
                  <PaidCell invoice={invoice} />
                </td>
                {/* Pinned right — see the note at the top. Same opaque ground
                    and hover treatment as the left anchor. */}
                <td
                  data-pinned-end=""
                  className="money sticky right-0 z-10 h-11 border-l border-line bg-surface pr-5 pl-3 text-right text-small whitespace-nowrap text-ink group-hover:bg-row-hover"
                >
                  <span className="currency-mark">{currencySymbol(invoice.currency)}</span>
                  {formatMinorDigits(invoice.amountMinor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollCue>
  );
}

/**
 * Paid carries a figure only when it says something Amount does not.
 *
 * On a settled invoice the two columns printed the same number at full money
 * width, twice a row, down the whole page — a column of noise reporting what
 * the status badge had already said. It is now filled only when part of the
 * money has arrived, which turns the column into a scan for exactly the rows
 * that need chasing: anything with a figure here is a partial.
 *
 * An overpayment — paid beyond the total, usually a duplicate transfer or a
 * refund not yet recorded — also shows, because that is an anomaly somebody has
 * to see. `!==` rather than `<` is what keeps it visible.
 */
function PaidCell({ invoice }: { invoice: InvoiceListRow }) {
  const notable = invoice.paidMinor > 0n && invoice.paidMinor !== invoice.amountMinor;

  if (!notable) return <span className="text-ink-muted">—</span>;

  const overpaid = invoice.paidMinor > invoice.amountMinor;
  return (
    <span className={overpaid ? 'text-refunded' : undefined}>
      <span className="currency-mark">{currencySymbol(invoice.currency)}</span>
      {formatMinorDigits(invoice.paidMinor)}
    </span>
  );
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
