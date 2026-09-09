import type { InvoiceDetail } from '@/lib/queries/invoices';
import { currencySymbol, formatDateTime, formatMinorDigits } from '@/lib/format';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { StatusBadge, paymentStatusKey } from '@/components/ui/status-badge';

const PROVIDER_LABEL: Record<string, string> = {
  stripe: 'Stripe',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
  manual: 'Manual',
};

/**
 * Every payment against this invoice, successful or not.
 *
 * Showing only the successes would make the page a lie of omission: an invoice
 * with three failed charges and a reminder ladder reads as a client ignoring
 * you, when it may be a card that keeps declining. The failures are why the
 * balance did not move.
 *
 * Which is exactly what the balance column has to prove. It is the outstanding
 * amount immediately after each row, and it is computed in SQL with a window
 * `filter (where status = 'succeeded')` — a failed row therefore repeats the
 * balance above it rather than reducing it. That repetition is the point: it is
 * visible evidence that the attempt did not count.
 *
 * ## Column order
 *
 * Amount and Balance after are adjacent, and Reference is last.
 *
 * Reference was in the middle, and it is the widest column here — 206px, driven
 * by ids like `pi_3OH7t6kSPrRuky3HQtqhtz0s`. That pushed the table to 933px
 * against 798px of container at a 1440px viewport, and the column it pushed off
 * the right edge was Balance after: the one column that exists to show a failed
 * attempt leaving the balance untouched was the one you had to scroll to find.
 *
 * Putting the two money columns side by side fixes that and reads better
 * anyway — "₦290,628 paid, ₦1,421,172 left" on one line — and leaves the long
 * opaque string, which nobody scans and everybody copies, as the thing that
 * scrolls.
 */
export function InvoicePayments({ invoice }: { invoice: InvoiceDetail }) {
  const symbol = currencySymbol(invoice.currency);
  const counted = invoice.payments.filter((p) => p.status === 'succeeded').length;

  const headCell =
    'bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';
  const cell = 'h-11 px-3 text-small whitespace-nowrap';

  return (
    <section
      aria-labelledby="payments-heading"
      className="rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3">
        <h2 id="payments-heading" className="text-h3 text-ink">
          Payment history
        </h2>
        {invoice.payments.length > 0 ? (
          <p className="text-small text-ink-muted">
            <span className="money">{invoice.payments.length}</span>{' '}
            {invoice.payments.length === 1 ? 'attempt' : 'attempts'} ·{' '}
            <span className="money">{counted}</span> counted toward the balance
          </p>
        ) : null}
      </header>

      {invoice.payments.length === 0 ? (
        <p className="px-4 py-8 text-small text-ink-muted">
          Nothing has been received against this invoice yet — no successful
          payment, and no failed or pending attempt either.
        </p>
      ) : (
        <ScrollCue>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={`${headCell} pl-4 text-left`}>
                  Date
                </th>
                <th scope="col" className={`${headCell} text-left`}>
                  Provider
                </th>
                <th scope="col" className={`${headCell} text-left`}>
                  Status
                </th>
                <th scope="col" className={`${headCell} text-right`}>
                  Amount
                </th>
                <th scope="col" className={`${headCell} text-right`}>
                  Balance after
                </th>
                {/* Last, and the first to scroll away. See the note above. */}
                <th scope="col" className={`${headCell} pr-5 text-left`}>
                  Reference
                </th>
              </tr>
            </thead>

            <tbody>
              {invoice.payments.map((payment) => {
                const badge = paymentStatusKey(payment.status);
                const counts = payment.status === 'succeeded';
                return (
                  <tr
                    key={payment.id}
                    className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
                  >
                    <td className={`money ${cell} pl-4 text-ink-secondary`}>
                      {formatDateTime(payment.occurredAt)}
                    </td>
                    <td className={`${cell} text-ink`}>
                      {PROVIDER_LABEL[payment.provider] ?? payment.provider}
                      {payment.method ? (
                        <span className="text-ink-muted"> · {payment.method}</span>
                      ) : null}
                    </td>
                    <td className="h-11 px-3">
                      <StatusBadge status={badge.key} label={badge.label} />
                    </td>
                    {/*
                      A payment carries its own currency. It is normally the
                      invoice's, but a mismatch is exactly the kind of thing
                      this page exists to expose, so the symbol comes from the
                      payment rather than from the invoice above it.
                    */}
                    <td
                      className={`money ${cell} text-right ${
                        counts ? 'text-ink' : 'text-ink-muted line-through'
                      }`}
                    >
                      <span className="currency-mark">
                        {currencySymbol(payment.currency)}
                      </span>
                      {formatMinorDigits(payment.amountMinor)}
                    </td>
                    <td className={`money ${cell} text-right text-ink-secondary`}>
                      <span className="currency-mark">{symbol}</span>
                      {formatMinorDigits(payment.balanceAfterMinor)}
                    </td>
                    {/* Mono, because a provider reference is a string someone
                        pastes into a support ticket and has to read character
                        by character — so it is never truncated, only scrolled. */}
                    <td className={`money ${cell} pr-5 text-ink-muted`}>
                      {payment.providerPaymentId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollCue>
      )}
    </section>
  );
}
