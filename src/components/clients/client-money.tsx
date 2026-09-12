import type { ClientListRow, CurrencyTotal } from '@/lib/queries/clients';
import { currencySymbol, formatMinorDigits } from '@/lib/format';

/* ==========================================================================
   Rendering a client's mixed-currency money.
   ==========================================================================

   A client invoiced in naira and paid in dollars has no single "total". §3's
   `≈` treatment exists for exactly this: the converted figure is what the
   balance is worth today at the latest rate, not what will land, and it is
   never shown without the mark.

   So the per-currency figures are the truth and the base figure is the summary.
   Which of the two leads depends on how much room there is — the table shows
   the base with the currencies beneath it, the detail panel shows every
   currency in full — but neither ever shows a converted figure bare.
   ========================================================================== */

/** One converted figure. Always marked, never bare. */
export function ApproxBase({
  minor,
  currency,
  incomplete,
  className = '',
}: {
  minor: bigint;
  currency: string;
  /** A currency had no rate, so this figure is short of the real total. */
  incomplete: boolean;
  className?: string;
}) {
  return (
    <span className={`money whitespace-nowrap ${className}`}>
      <span className="currency-mark">≈{currencySymbol(currency)}</span>
      {formatMinorDigits(minor)}
      {incomplete ? (
        <span
          className="text-failed"
          title="A currency on this client has no exchange rate, so this figure is short of the real total."
        >
          {' '}
          *
        </span>
      ) : null}
    </span>
  );
}

/** The per-currency breakdown, which is the figure that is actually exact. */
export function CurrencyBreakdown({
  totals,
  field,
  className = '',
}: {
  totals: CurrencyTotal[];
  field: keyof Omit<CurrencyTotal, 'currency'>;
  className?: string;
}) {
  const shown = totals.filter((t) => t[field] !== 0n);
  if (shown.length === 0) return <span className="text-ink-muted">—</span>;

  return (
    <span className={className}>
      {shown.map((total, index) => (
        <span key={total.currency} className="money whitespace-nowrap">
          {index > 0 ? <span className="text-ink-muted"> · </span> : null}
          <span className="currency-mark">{currencySymbol(total.currency)}</span>
          {formatMinorDigits(total[field])}
        </span>
      ))}
    </span>
  );
}

/**
 * Base figure over its currencies. One converted summary, the exact figures
 * beneath it, so nothing has to be taken on trust.
 */
export function MoneyStack({
  client,
  field,
  align = 'right',
}: {
  client: ClientListRow;
  field: 'invoicedMinor' | 'paidMinor' | 'outstandingMinor';
  align?: 'left' | 'right';
}) {
  const baseField =
    field === 'invoicedMinor'
      ? client.base.invoicedMinor
      : field === 'paidMinor'
        ? client.base.paidMinor
        : client.base.outstandingMinor;

  const single = client.totals.length === 1;

  // One currency and it is the base one: the conversion is the identity, so the
  // `≈` would be a lie in the other direction. Show it plainly.
  if (single && client.totals[0]!.currency === client.base.currency) {
    return (
      <span className={`money block whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}>
        <span className="currency-mark">{currencySymbol(client.base.currency)}</span>
        {formatMinorDigits(client.totals[0]![field])}
      </span>
    );
  }

  return (
    <span className={`block ${align === 'right' ? 'text-right' : ''}`}>
      <ApproxBase
        minor={baseField}
        currency={client.base.currency}
        incomplete={client.baseIncomplete}
        className="block text-ink"
      />
      {client.totals.length > 0 ? (
        <CurrencyBreakdown totals={client.totals} field={field} className="block text-micro text-ink-muted" />
      ) : null}
    </span>
  );
}
