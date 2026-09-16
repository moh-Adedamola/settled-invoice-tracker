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
      id="unmatched"
      aria-label="Unmatched payments"
      className="rounded-md border border-line bg-surface"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3">
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
        <>
          {/*
            Below md: stacked entries, gap-group apart per §6.

            Measured at 390x844 before this: the table rendered 818px wide in a
            340px slot — 58% hidden — with the reference pinned left and the
            amount, the client and the match control all off the right edge. A
            queue whose entire purpose is "these need a human" was the least
            reachable block on the page.

            The entry leads with the amount and the client, because the question
            here is "what is this money and whose is it". The provider reference
            — an opaque string like `pi_3Oz5nk7P2ahRpe87JyovKPqi` that wrapped to
            14 characters per line in the table — drops to metadata, where a
            single truncated line is the right amount of it.
          */}
          <ul className="flex flex-col gap-group p-4 md:hidden">
            {payments.map((payment) => (
              <li key={payment.id}>
                <Entry payment={payment} readOnly={readOnly} />
              </li>
            ))}
          </ul>

          <ScrollCue className="hidden md:block">
            <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-[var(--sticky-top)] z-20 bg-surface px-4 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                >
                  Reference
                </th>
                {['Received', 'Provider', 'Client'].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="sticky top-[var(--sticky-top)] z-10 bg-surface px-3 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                  >
                    {label}
                  </th>
                ))}
                <th
                  scope="col"
                  className="sticky top-[var(--sticky-top)] z-10 bg-surface px-3 py-2.5 text-right text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                >
                  Amount
                </th>
                {readOnly ? null : (
                  <th
                    scope="col"
                    className="sticky top-[var(--sticky-top)] z-10 bg-surface py-2.5 pr-5 pl-3 text-right text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
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
                    {formatMinorDigits(payment.amountMinor, payment.currency)}
                  </td>
                  {readOnly ? null : (
                    <td className="h-11 py-0 pr-5 pl-3 text-right">
                      {/* A link, not a form. Navigating to the payment is a
                          read; the match itself is a POST from there, which is
                          what the sameSite=lax cookie requires of a mutation. */}
                      <Link
                        href={`/payments/${payment.id}`}
                        className="inline-flex h-control-sm items-center rounded-sm border border-line-strong px-3 text-small whitespace-nowrap text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-surface-overlay"
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
        </>
      )}
    </section>
  );
}

/**
 * One unmatched payment, below `md`.
 *
 * The whole entry is a link to the payment, where the matching flow lives — so
 * the primary target is the card rather than a 32px button at the end of a row
 * that was off-screen anyway.
 *
 * A queue item should still name its verb, so "Match →" rides at the end of the
 * metadata line for a writer. As text rather than as a second control: a
 * bordered button inside a card that links to the same place is two targets for
 * one destination, and it cost 48px on every entry.
 */
function Entry({
  payment,
  readOnly,
}: {
  payment: UnmatchedPayment;
  readOnly: boolean;
}) {
  return (
    <Link
      href={`/payments/${payment.id}`}
      className="flex flex-col gap-within rounded-sm border border-line bg-surface-raised px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="money text-h4 text-ink">
          <span className="currency-mark">{currencySymbol(payment.currency)}</span>
          {formatMinorDigits(payment.amountMinor, payment.currency)}
        </span>
        <span className="shrink-0 text-micro text-ink-muted">
          {formatDateTime(payment.occurredAt)}
        </span>
      </div>

      <span className="text-small text-ink">
        {payment.clientName ?? (
          <span className="text-ink-muted">Unidentified client</span>
        )}
      </span>

      {/* One line, truncated, with the verb on the end of it.

          A provider reference is for matching against a gateway dashboard, not
          for reading — in the table it wrapped to 14 characters a line and took
          three lines of a 44px row.

          The verb was a bordered 44px button here at first, and it cost 48px on
          every entry — 192px across the queue, on a page being cut to fit three
          viewports. It is not a second target: the whole card already links to
          the payment, so the button was a 44px control inside a 180px control
          going to the same place. As text it still says what happens next,
          which is the only job it had. */}
      <span className="flex items-baseline justify-between gap-3">
        <span className="money min-w-0 truncate text-micro text-ink-muted">
          {payment.provider}
          {payment.method ? ` · ${payment.method}` : ''} ·{' '}
          {payment.providerPaymentId}
        </span>
        {readOnly ? null : (
          <span className="shrink-0 text-micro whitespace-nowrap text-accent">
            Match →
          </span>
        )}
      </span>
    </Link>
  );
}
