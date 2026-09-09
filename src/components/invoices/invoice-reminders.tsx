import type { InvoiceDetail } from '@/lib/queries/invoices';
import { formatDateTime } from '@/lib/format';

/** The schema's `reminders_invoice_sequence_key` allows exactly these three. */
const LADDER = [
  { sequence: 1, label: 'First nudge' },
  { sequence: 2, label: 'Second nudge' },
  { sequence: 3, label: 'Final notice' },
] as const;

/**
 * The escalation ladder, shown as a ladder rather than as a list of rows.
 *
 * A table of only the reminders that were sent answers the wrong question. What
 * someone opening an overdue invoice wants to know is *how far this has gone* —
 * and "two of three sent, the final notice is still available" is a different
 * situation from "all three sent, we are out of nudges". Rendering the unsent
 * rungs is what makes that legible, so all three slots always appear once the
 * ladder has started.
 *
 * When it has not started, three greyed rows would be three rows of nothing;
 * a sentence is the honest form.
 */
export function InvoiceReminders({ invoice }: { invoice: InvoiceDetail }) {
  const bySequence = new Map(invoice.reminders.map((r) => [r.sequence, r]));

  return (
    <section
      aria-labelledby="reminders-heading"
      className="rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3">
        <h2 id="reminders-heading" className="text-h3 text-ink">
          Reminders
        </h2>
        {invoice.reminders.length > 0 ? (
          <p className="text-small text-ink-muted">
            <span className="money">{invoice.reminders.length}</span> of{' '}
            <span className="money">{LADDER.length}</span> sent
          </p>
        ) : null}
      </header>

      {invoice.reminders.length === 0 ? (
        <p className="px-4 py-8 text-small text-ink-muted">
          No reminder has been sent for this invoice.
        </p>
      ) : (
        <ul className="flex flex-col">
          {LADDER.map((rung) => {
            const sent = bySequence.get(rung.sequence);
            return (
              <li
                key={rung.sequence}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line-subtle px-4 py-3 first:border-t-0"
              >
                <span className="flex items-baseline gap-2.5">
                  {/* Marker before colour, per §3.3 — the glyph is what
                      distinguishes sent from pending, not the ink alone. */}
                  <span
                    aria-hidden="true"
                    className={`text-[10px] leading-none ${
                      sent ? 'text-paid' : 'text-ink-muted'
                    }`}
                  >
                    {sent ? '●' : '○'}
                  </span>
                  <span className={`text-small ${sent ? 'text-ink' : 'text-ink-muted'}`}>
                    {rung.label}
                  </span>
                </span>

                {sent ? (
                  <span className="money text-small whitespace-nowrap text-ink-secondary">
                    {formatDateTime(sent.sentAt)}
                    <span className="text-ink-muted"> · {sent.channel}</span>
                  </span>
                ) : (
                  <span className="text-small text-ink-muted">Not sent</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
