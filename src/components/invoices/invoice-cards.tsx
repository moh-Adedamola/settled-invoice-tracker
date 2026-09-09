import Link from 'next/link';

import type { InvoiceListResult, InvoiceListRow, SortKey } from '@/lib/queries/invoices';
import { currencySymbol, formatDateFull, formatMinorDigits } from '@/lib/format';
import { patchQuery } from '@/lib/search-params';
import { StatusBadge, invoiceStatusKey } from '@/components/ui/status-badge';

/**
 * The phone rendering of the ledger. Below `md` this replaces the table.
 *
 * ## Why the table is not just scrolled here
 *
 * §8 rejected card-stacking because a ledger is read by comparing figures down
 * a column, and stacking destroys the alignment the tabular-figure premise
 * rests on. That argument is sound, and it stops applying at the point where
 * there is no column left to compare down. Measured on the invoice table:
 *
 * | viewport | container | readable columns |
 * | --- | --- | --- |
 * | 360px | 295px | Invoice, Amount — the two pins, and nothing between them |
 * | 390px | 325px | Invoice, Amount |
 * | 430px | 365px | Invoice, Client, Amount |
 * | 560px | 495px | Invoice, Client, Amount; Status sits under the Amount pin |
 *
 * The two pinned columns are 150px and 147px. At 360px they need 297px of a
 * 295px container, so the scrolling middle is zero pixels wide and the client
 * name — the thing that tells you whose invoice this is — is not merely
 * clipped, it is off-screen with no way to reach it except scrolling a region
 * that has no width. The scroll cue lands on top of the pinned invoice number
 * and dims it, because there is nothing else for it to sit over.
 *
 * The four columns that matter need 150 + 185 + 118 + 147 = 600px of table, so
 * about 648px of viewport. `md` (768px) is the first standard breakpoint that
 * clears it with room to spare — measured there: 703px of container, six of
 * eight columns readable.
 *
 * ## The alignment premise survives, and is better served
 *
 * Every entry is the same width and the amount is flush to the same right
 * padding, so the amounts still form one aligned column of tabular figures down
 * the page — which is more than the table manages at 360px, where the amount
 * column is reachable only by scrolling and cannot be compared with the row
 * above it at all. The premise is kept inside the entry rather than across a
 * table that is not rendering.
 *
 * ## Stacked entries, not floating cards
 *
 * One bordered container, entries separated by the same `line-subtle` hairline
 * the table uses, no zebra and no per-entry shadow. §6 spends elevation on
 * genuine layers; twenty-five shadowed cards would be twenty-five objects where
 * the ledger is one. This reads as a ledger that has been folded, not as a
 * different product.
 */
export function InvoiceCards({
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
  const listQuery = query.toString();
  const detailSuffix = listQuery ? `?back=${encodeURIComponent(listQuery)}` : '';

  return (
    <div className="flex flex-col gap-3">
      <SortBar query={query} sort={sort} direction={direction} />

      <ul className="overflow-hidden rounded-md border border-line bg-surface">
        {result.rows.map((invoice) => (
          <li key={invoice.id} className="border-t border-line-subtle first:border-t-0">
            <Entry invoice={invoice} href={`/invoices/${invoice.id}${detailSuffix}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Entry({ invoice, href }: { invoice: InvoiceListRow; href: string }) {
  const badge = invoiceStatusKey(invoice.status);
  const symbol = currencySymbol(invoice.currency);
  const partPaid = invoice.paidMinor > 0n && invoice.paidMinor !== invoice.amountMinor;

  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="money text-small whitespace-nowrap text-ink">{invoice.number}</span>
        <StatusBadge status={badge.key} label={badge.label} />
      </div>

      {/* The only line allowed to wrap. A truncated client name is the defect
          this layout exists to fix, so it gets the room instead of the ellipsis. */}
      <p className="text-small text-ink-secondary">{invoice.clientName}</p>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-micro text-ink-muted">
          {invoice.daysOverdue > 0 ? (
            <span className="text-overdue">
              {invoice.daysOverdue} {invoice.daysOverdue === 1 ? 'day' : 'days'} overdue
            </span>
          ) : invoice.dueAt ? (
            <>Due {formatDateFull(invoice.dueAt)}</>
          ) : invoice.issuedAt ? (
            <>Issued {formatDateFull(invoice.issuedAt)}</>
          ) : (
            'Not issued'
          )}
          {partPaid ? (
            <>
              {' · '}
              <span className="money">
                {symbol}
                {formatMinorDigits(invoice.paidMinor)}
              </span>{' '}
              paid
            </>
          ) : null}
        </span>

        {/* Flush right on every entry, so the amounts still line up down the
            page — the tabular-figure premise, kept inside the card. */}
        <span
          data-card-amount=""
          className="money shrink-0 text-small whitespace-nowrap text-ink"
        >
          <span className="currency-mark">{symbol}</span>
          {formatMinorDigits(invoice.amountMinor)}
        </span>
      </div>
    </Link>
  );
}

/**
 * Sorting, which the table gets from its column headers and this layout has no
 * headers to hang off. Dropping it below `md` would make the phone view the
 * only place in the app where a ledger cannot be reordered.
 *
 * The active control carries the same 2px copper underline §7 puts on the
 * active column, so the two layouts say "sorted by this" the same way.
 */
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'issued', label: 'Issued' },
  { key: 'due', label: 'Due' },
  { key: 'amount', label: 'Amount' },
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status' },
];

function SortBar({
  query,
  sort,
  direction,
}: {
  query: URLSearchParams;
  sort: SortKey;
  direction: 'asc' | 'desc';
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-0.5 pb-0.5">
      <span className="shrink-0 text-micro uppercase text-ink-muted">Sort</span>
      {SORTS.map(({ key, label }) => {
        const active = sort === key;
        const next = active ? (direction === 'asc' ? 'desc' : 'asc') : key === 'client' ? 'asc' : 'desc';
        return (
          <Link
            key={key}
            href={`/invoices${patchQuery(query, { sort: key, dir: next })}`}
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
  );
}
