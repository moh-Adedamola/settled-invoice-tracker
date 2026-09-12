import Link from 'next/link';

import type { UnmatchedPayment } from '@/lib/queries/dashboard';
import { currencySymbol, formatDateTime, formatMinorDigits } from '@/lib/format';
import { EmptyState } from './empty-state';
import { ScrollCue } from '@/components/ui/scroll-cue';

/**
 * Money received that no invoice claims.
 *
 * In read-only mode the "Match to invoice" control is ABSENT, not disabled. A
 * disabled button advertises a capability the viewer does not have and invites
 * them to go looking for it; the public demo simply has no such column.
 *
 * The control navigates to the payment, where the matching flow lives. It is a
 * link because navigation is a read; `matchPayment` itself is a POST from that
 * page and calls `assertCanWrite()` before anything else, because hiding a
 * control is not an authorisation check.
 */
export function UnmatchedQueue({
  payments,
  readOnly,
}: {
  payments: UnmatchedPayment[];
  readOnly: boolean;
}) {
  return (
    <section
      aria-label="Unmatched payments"
      className="rounded-md border border-line bg-surface"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle px-4 py-3">
        <h2 className="text-h3 text-ink">Unmatched payments</h2>
        <p className="text-small text-ink-muted">
          {payments.length === 0
            ? 'queue empty'
            : `${payments.length} awaiting a match`}
        </p>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          title="Everything is matched"
          body="Payments that arrive without an invoice reference will queue here for manual matching."
        />
      ) : (
        <ScrollCue>
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-20 bg-surface px-4 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                >
                  Reference
                </th>
                {['Received', 'Provider', 'Client'].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="sticky top-0 z-10 bg-surface px-3 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                  >
                    {label}
                  </th>
                ))}
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-surface px-3 py-2.5 text-right text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                >
                  Amount
                </th>
                {readOnly ? null : (
                  <th
                    scope="col"
                    className="sticky top-0 z-10 bg-surface py-2.5 pr-5 pl-3 text-right text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                  >
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
                >
                  <td className="money sticky left-0 z-10 h-11 max-w-[220px] truncate bg-surface px-4 text-small text-ink group-hover:bg-row-hover">
                    {payment.providerPaymentId}
                  </td>
                  <td className="money h-11 px-3 text-small whitespace-nowrap text-ink-muted">
                    {formatDateTime(payment.occurredAt)}
                  </td>
                  <td className="h-11 px-3 text-small whitespace-nowrap text-ink-secondary">
                    {payment.provider}
                    {payment.method ? (
                      <span className="text-ink-muted"> · {payment.method}</span>
                    ) : null}
                  </td>
                  <td className="h-11 px-3 text-small whitespace-nowrap text-ink">
                    {payment.clientName ?? (
                      <span className="text-ink-muted">unidentified</span>
                    )}
                  </td>
                  <td className="money h-11 px-3 text-right text-small whitespace-nowrap text-ink">
                    <span className="currency-mark">
                      {currencySymbol(payment.currency)}
                    </span>
                    {formatMinorDigits(payment.amountMinor)}
                  </td>
                  {readOnly ? null : (
                    <td className="h-11 py-0 pr-5 pl-3 text-right">
                      {/* A link, not a form. Navigating to the payment is a
                          read; the match itself is a POST from there, which is
                          what the sameSite=lax cookie requires of a mutation. */}
                      <Link
                        href={`/payments/${payment.id}`}
                        className="inline-flex h-8 items-center rounded-sm border border-line-strong px-3 text-small whitespace-nowrap text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-overlay"
                      >
                        Match to invoice
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollCue>
      )}
    </section>
  );
}
