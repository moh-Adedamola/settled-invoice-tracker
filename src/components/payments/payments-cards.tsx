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
              className={`inline-flex h-control-sm min-w-control-sm shrink-0 items-center justify-center gap-1 rounded-xs px-1 text-small whitespace-nowrap ${
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

      {/*
        Flat, separated entries — `gap-within` per §6, never the 0px the
        hairline-divided list had.

        ## Day grouping was built here and measured out again

        §6 asks a run longer than eight entries to carry grouping headers, and
        this renders 25, so the first build grouped by business day. Measured at
        390x844: **the page went from 3955px to 4914px.** The 25 payments fall
        across ~18 distinct days — roughly one header per card — so each
        singleton day cost a header, a `gap-region` and a `gap-group` to
        separate one item from one item. 61px of chrome per payment to say
        something the card already said.

        That is a fact about this domain, not about this page: a business
        issuing 54 payments over six weeks has one or two on most days, so day
        groups are singletons by default. The rule in §6 now carries the caveat
        this measurement produced — a header has to separate a *group*, and a
        run of singletons is not grouped, it is just a list with labels.

        What differentiates the entries instead is inside them: the amount leads
        at `text-h4` so the first line of every card differs, an unmatched
        payment carries a copper-blue left edge, and the height varies with the
        method note and whether there is an invoice number.
      */}
      <ul className="flex flex-col gap-within">
        {result.rows.map((payment) => (
          <li key={payment.id}>
            <Entry payment={payment} href={`/payments/${payment.id}${suffix}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One payment.
 *
 * Leads with the amount, at `text-h4` — §5's step for the headline of a stacked
 * entry, and the field that differs most between two adjacent rows. The date
 * used to hold that position, in the same size and weight as everything else on
 * the card, which is how 25 cards came to differ only in their digits.
 *
 * Height varies with content by construction, which is §6's third separation
 * rule: an unmatched payment carries a mark where a matched one carries an
 * invoice number, and a long method note wraps. `/clients` got that variation
 * by accident of email length and was the one list that never read as a wall;
 * here it is deliberate.
 */
function Entry({ payment, href }: { payment: PaymentListRow; href: string }) {
  const badge = paymentStatusKey(payment.status);

  return (
    <Link
      href={href}
      className={`flex flex-col gap-within rounded-sm border bg-surface px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover ${
        payment.unmatched ? 'border-l-[3px] border-line border-l-pending' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="money text-h4 whitespace-nowrap text-ink">
          <span className="currency-mark">{currencySymbol(payment.currency)}</span>
          {formatMinorDigits(payment.amountMinor, payment.currency)}
        </span>
        <StatusBadge status={badge.key} label={badge.label} />
      </div>

      {/* The only line allowed to wrap — a truncated client name is the defect
          this layout exists to avoid. */}
      <p className="text-small text-ink-secondary">
        {payment.clientName ?? <span className="text-ink-muted">Unknown client</span>}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 text-micro text-ink-muted">
          <span className="money">{formatDateTime(payment.occurredAt)}</span>
          {' · '}
          {PROVIDER_LABEL[payment.provider] ?? payment.provider}
          {payment.method ? ` · ${payment.method}` : ''}
        </span>
        {payment.unmatched ? (
          <UnmatchedMark />
        ) : (
          <span className="money shrink-0 text-micro text-ink-muted">
            {payment.invoiceNumber}
          </span>
        )}
      </div>
    </Link>
  );
}
