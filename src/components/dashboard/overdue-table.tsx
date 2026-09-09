import type { OverdueInvoice } from '@/lib/queries/dashboard';
import { currencySymbol, formatDate, formatMinorDigits } from '@/lib/format';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from './empty-state';

/**
 * §7 table: 44px rows, hairline rules, no zebra, sticky header, --row-hover.
 * §8 narrow screens: horizontal scroll with the invoice number pinned, never
 * card-stacking — a ledger is read by comparing figures down a column.
 *
 * Every row here is overdue by the derived rule (due_at past, balance > 0), so
 * the badge shows `overdue` regardless of what the status column says. The
 * query layer and this table agree by construction.
 */
export function OverdueTable({ invoices }: { invoices: OverdueInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <section className="rounded-md border border-line bg-surface">
        <Header count={0} />
        <EmptyState
          title="Nothing overdue"
          body="Every issued invoice is either settled or still within its terms."
        />
      </section>
    );
  }

  return (
    <section
      aria-label="Overdue invoices"
      className="rounded-md border border-line bg-surface"
    >
      <Header count={invoices.length} />

      <ScrollCue>
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 bg-surface px-4 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
              >
                Invoice
              </th>
              {['Client', 'Status', 'Reminders'].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="sticky top-0 z-10 bg-surface px-3 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                >
                  {label}
                </th>
              ))}
              {['Due', 'Days over', 'Outstanding'].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="sticky top-0 z-10 bg-surface px-3 py-2.5 text-right text-micro font-medium uppercase whitespace-nowrap text-ink-muted last:pr-5"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
              >
                {/* Pinned. Needs its own opaque ground or scrolled cells show
                    through, and must repeat the hover so the row reads as one. */}
                {/* whitespace-nowrap is load-bearing: the pinned column gets
                    whatever width the 720px table minimum leaves it, which at
                    narrow widths is under 100px. Wrapping an invoice number
                    across two lines pushed the row from 44px to 58px and broke
                    the scan down the amount column. */}
                <td className="money sticky left-0 z-10 h-11 bg-surface px-4 text-small whitespace-nowrap text-ink group-hover:bg-row-hover">
                  {invoice.number}
                </td>
                <td className="h-11 px-3 text-small whitespace-nowrap text-ink">
                  {invoice.clientName}
                </td>
                <td className="h-11 px-3">
                  <StatusBadge status="overdue" />
                </td>
                <td className="h-11 px-3 text-small whitespace-nowrap text-ink-secondary">
                  {invoice.lastReminderSequence === 0 ? (
                    <span className="text-ink-muted">none sent</span>
                  ) : (
                    <>
                      <span className="money">{invoice.lastReminderSequence}</span>
                      <span className="text-ink-muted"> of 3</span>
                    </>
                  )}
                </td>
                <td className="money h-11 px-3 text-right text-small whitespace-nowrap text-ink-muted">
                  {formatDate(invoice.dueAt)}
                </td>
                <td className="money h-11 px-3 text-right text-small text-overdue">
                  {invoice.daysOverdue}
                </td>
                <td className="money h-11 pr-5 pl-3 text-right text-small text-ink">
                  <span className="currency-mark">
                    {currencySymbol(invoice.currency)}
                  </span>
                  {formatMinorDigits(invoice.outstandingMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollCue>
    </section>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle px-4 py-3">
      <h2 className="text-h3 text-ink">Overdue invoices</h2>
      <p className="text-small text-ink-muted">
        {count === 0 ? 'none' : `${count} past due`}
      </p>
    </div>
  );
}
