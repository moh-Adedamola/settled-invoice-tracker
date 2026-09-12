import Link from 'next/link';

import type {
  PaymentListResult,
  PaymentListRow,
  PaymentSortKey,
} from '@/lib/queries/payments';
import { currencySymbol, formatDateTime, formatMinorDigits } from '@/lib/format';
import { patchQuery } from '@/lib/search-params';
import { StatusBadge, paymentStatusKey } from '@/components/ui/status-badge';

import { PROVIDER_LABEL, UnmatchedMark } from './payment-bits';

const SORTS: Array<{ key: PaymentSortKey; label: string }> = [
  { key: 'date', label: 'Date' },
  { key: 'amount', label: 'Amount' },
  { key: 'client', label: 'Client' },
  { key: 'status', label: 'Status' },
];

/**
 * The phone rendering. Below `md` this replaces the table, per §8 — the
 * measurements and the reasoning are in `invoice-cards.tsx` and apply here
 * unchanged; this table is wider than the ledger's, so it clears the threshold
 * by less, not more.
 *
 * Amounts sit flush to one right edge in Plex Mono so the column of figures
 * survives the stacking, which is the whole premise §8 was worried about
 * losing.
 */
export function PaymentsCards({
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <span className="mr-1 text-micro uppercase text-ink-muted">Sort</span>
        {SORTS.map(({ key, label }) => {
          const active = sort === key;
          const next = active ? (direction === 'asc' ? 'desc' : 'asc') : key === 'client' ? 'asc' : 'desc';
          return (
            <Link
              key={key}
              href={`/payments${patchQuery(query, { sort: key, dir: next })}`}
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
        {result.rows.map((payment) => (
          <li key={payment.id} className="border-t border-line-subtle first:border-t-0">
            <Entry payment={payment} href={`/payments/${payment.id}${suffix}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Entry({ payment, href }: { payment: PaymentListRow; href: string }) {
  const badge = paymentStatusKey(payment.status);

  return (
    <Link
      href={href}
      className="flex flex-col gap-1.5 px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="money text-small whitespace-nowrap text-ink">
          {formatDateTime(payment.occurredAt)}
        </span>
        <StatusBadge status={badge.key} label={badge.label} />
      </div>

      {/* The only line allowed to wrap — a truncated client name is the defect
          this layout exists to avoid. */}
      <p className="text-small text-ink-secondary">
        {payment.clientName ?? <span className="text-ink-muted">Unknown client</span>}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {payment.unmatched ? (
          <UnmatchedMark />
        ) : (
          <span className="money text-micro text-ink-muted">{payment.invoiceNumber}</span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-micro text-ink-muted">
          {PROVIDER_LABEL[payment.provider] ?? payment.provider}
          {payment.method ? ` · ${payment.method}` : ''}
        </span>
        {/* §8: `min-w-0`, never `shrink-0` — a method note can make this line
            long enough to run past the card's padding and be clipped silently. */}
        <span
          data-card-amount=""
          className="money min-w-0 text-right text-small whitespace-nowrap text-ink"
        >
          <span className="currency-mark">{currencySymbol(payment.currency)}</span>
          {formatMinorDigits(payment.amountMinor)}
        </span>
      </div>
    </Link>
  );
}
