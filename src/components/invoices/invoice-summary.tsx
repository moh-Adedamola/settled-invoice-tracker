import type { InvoiceDetail } from '@/lib/queries/invoices';
import { currencySymbol, formatDate, formatMinorDigits } from '@/lib/format';

/**
 * Total, paid, outstanding — and, for a foreign-currency invoice, what that is
 * worth in the books' own currency.
 *
 * The conversion is marked `≈` and never appears without it. The rate is the
 * most recent `fx_rates` tick, which means the figure is indicative: it is what
 * the outstanding balance is worth *today*, not what it will settle at. §3 of
 * the design system calls that treatment out and the dashboard's outstanding
 * tile already uses it; this reuses the same mark rather than inventing a
 * second way of saying "roughly".
 *
 * The invoice's own currency stays primary and exact. The base equivalent is
 * secondary and sits below it, so nothing here reads as though the agency has
 * been paid naira it has not been paid.
 */
export function InvoiceSummary({ invoice }: { invoice: InvoiceDetail }) {
  const symbol = currencySymbol(invoice.currency);
  const settled = invoice.outstandingMinor === 0n;

  return (
    <section
      aria-labelledby="summary-heading"
      className="rounded-md border border-line bg-surface-raised"
    >
      <header className="border-b border-line-subtle px-4 py-3">
        <h2 id="summary-heading" className="text-h3 text-ink">
          Summary
        </h2>
      </header>

      <dl className="flex flex-col gap-3 px-4 py-4">
        <Row label="Invoice total">
          <span className="money text-small whitespace-nowrap text-ink">
            <span className="currency-mark">{symbol}</span>
            {formatMinorDigits(invoice.amountMinor)}
          </span>
        </Row>

        <Row label="Paid to date">
          <span
            className={`money text-small whitespace-nowrap ${
              invoice.paidMinor > 0n ? 'text-paid' : 'text-ink-muted'
            }`}
          >
            <span className="currency-mark">{symbol}</span>
            {formatMinorDigits(invoice.paidMinor)}
          </span>
        </Row>

        {/* The one figure someone opens this page to read, so it gets the
            double rule above it and the only non-small type in the panel. */}
        <div className="rule-double flex items-baseline justify-between gap-4 pt-3">
          <dt className="text-small text-ink-secondary">Outstanding</dt>
          <dd
            className={`money text-h3 whitespace-nowrap ${
              settled ? 'text-paid' : invoice.status === 'overdue' ? 'text-overdue' : 'text-ink'
            }`}
          >
            <span className="currency-mark">{symbol}</span>
            {formatMinorDigits(invoice.outstandingMinor)}
          </dd>
        </div>
      </dl>

      {invoice.base ? (
        <div className="border-t border-line-subtle px-4 py-3">
          <dl className="flex flex-col gap-2">
            <Row label={`Total, ${invoice.base.currency}`}>
              <span className="money text-small whitespace-nowrap text-ink-secondary">
                <span className="currency-mark">
                  ≈{currencySymbol(invoice.base.currency)}
                </span>
                {formatMinorDigits(invoice.base.amountMinor)}
              </span>
            </Row>
            <Row label={`Outstanding, ${invoice.base.currency}`}>
              <span className="money text-small whitespace-nowrap text-ink-secondary">
                <span className="currency-mark">
                  ≈{currencySymbol(invoice.base.currency)}
                </span>
                {formatMinorDigits(invoice.base.outstandingMinor)}
              </span>
            </Row>
          </dl>
          <p className="mt-2 text-micro text-ink-muted">
            Indicative, at{' '}
            <span className="money">
              1&nbsp;{invoice.currency}&nbsp;=&nbsp;{invoice.base.rate}&nbsp;
              {invoice.base.currency}
            </span>{' '}
            as of {formatDate(invoice.base.fetchedAt)}. The invoice settles in{' '}
            {invoice.currency}; this is what it is worth today, not what it will
            be received at.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-small text-ink-secondary">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
