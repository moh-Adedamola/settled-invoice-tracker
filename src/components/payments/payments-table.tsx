import Link from 'next/link';

import type {
  PaymentListResult,
  PaymentSortKey,
} from '@/lib/queries/payments';
import { currencySymbol, formatDateTime, formatMinorDigits } from '@/lib/format';
import { patchQuery } from '@/lib/search-params';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { SortableColumn } from '@/components/ui/sortable-column';
import { StatusBadge, paymentStatusKey } from '@/components/ui/status-badge';

import { PROVIDER_LABEL, UnmatchedMark } from './payment-bits';

/**
 * §7 table, §8 pinning — the same conventions as the ledger and the client
 * list, because all three are read the same way.
 *
 * Received is pinned left (when the money moved is how a payment is
 * identified — the reference is opaque and nobody scans it) and Amount right.
 * The reference is last in the scrolling middle for the reason written out in
 * `invoice-payments.tsx`: it is the widest column, nobody reads it, everybody
 * copies it, so it is the thing that scrolls.
 */
const SCROLLING_COLUMNS: Array<{
  key: PaymentSortKey | null;
  label: string;
  align: 'left' | 'right';
}> = [
  { key: 'client', label: 'Client', align: 'left' },
  { key: null, label: 'Invoice', align: 'left' },
  { key: 'provider', label: 'Provider', align: 'left' },
  { key: 'status', label: 'Status', align: 'left' },
  { key: null, label: 'Reference', align: 'left' },
];

export function PaymentsTable({
  result,
  query,
  sort,
  direction,
}: {
  result: PaymentListResult;
  query: URLSearchParams;
  sort: PaymentSortKey;
  direction: 'asc' | 'desc';
}) {
  const listQuery = query.toString();
  const suffix = listQuery ? `?back=${encodeURIComponent(listQuery)}` : '';

  const sortHref = (key: PaymentSortKey) => {
    // Dates and amounts read best largest first; names read best A–Z.
    const next =
      sort === key ? (direction === 'asc' ? 'desc' : 'asc') : key === 'client' ? 'asc' : 'desc';
    return `/payments${patchQuery(query, { sort: key, dir: next })}`;
  };

  const headCell =
    'sticky top-0 z-10 bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';
  const cell = 'h-11 px-3 text-small whitespace-nowrap';

  return (
    <ScrollCue className="hidden rounded-md border border-line bg-surface md:block">
      <table className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr>
            <SortableColumn
              href={sortHref('date')}
              label="Received"
              active={sort === 'date'}
              direction={direction}
              className={`${headCell} sticky left-0 z-20 px-4 text-left`}
            />
            {SCROLLING_COLUMNS.map((column) => {
              const cellClass = `${headCell} ${column.align === 'right' ? 'text-right' : 'text-left'}`;
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
              href={sortHref('amount')}
              label="Amount"
              active={sort === 'amount'}
              direction={direction}
              align="right"
              className={`${headCell} sticky right-0 z-20 border-l border-line pr-5 text-right`}
            />
          </tr>
        </thead>

        <tbody>
          {result.rows.map((payment) => {
            const badge = paymentStatusKey(payment.status);
            return (
              <tr
                key={payment.id}
                className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
              >
                <td className="money sticky left-0 z-10 h-11 bg-surface px-4 text-small whitespace-nowrap text-ink group-hover:bg-row-hover">
                  <Link
                    href={`/payments/${payment.id}${suffix}`}
                    className="rounded-xs underline-offset-2 hover:underline"
                  >
                    {formatDateTime(payment.occurredAt)}
                  </Link>
                </td>

                <td className={`${cell} text-ink`}>
                  {payment.clientName ?? <span className="text-ink-muted">Unknown</span>}
                </td>

                {/*
                  The unmatched marker sits in the Invoice column rather than
                  beside the status, because "no invoice" is a fact about which
                  invoice this is for — and putting it here means the column
                  never renders an empty cell that reads as missing data.
                */}
                <td className={`money ${cell} text-ink-secondary`}>
                  {payment.invoiceNumber && payment.invoiceId ? (
                    <Link
                      href={`/invoices/${payment.invoiceId}`}
                      className="rounded-xs underline-offset-2 hover:underline"
                    >
                      {payment.invoiceNumber}
                    </Link>
                  ) : (
                    <UnmatchedMark />
                  )}
                </td>

                <td className={`${cell} text-ink-secondary`}>
                  {PROVIDER_LABEL[payment.provider] ?? payment.provider}
                  {payment.method ? (
                    <span className="text-ink-muted"> · {payment.method}</span>
                  ) : null}
                </td>

                <td className="h-11 px-3">
                  <StatusBadge status={badge.key} label={badge.label} />
                </td>

                <td className={`money ${cell} text-ink-muted`}>{payment.providerPaymentId}</td>

                <td
                  data-pinned-end=""
                  className="money sticky right-0 z-10 h-11 border-l border-line bg-surface pr-5 pl-3 text-right text-small whitespace-nowrap text-ink group-hover:bg-row-hover"
                >
                  <span className="currency-mark">{currencySymbol(payment.currency)}</span>
                  {formatMinorDigits(payment.amountMinor)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollCue>
  );
}
