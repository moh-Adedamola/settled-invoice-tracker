import Link from 'next/link';

import type { OverdueInvoice } from '@/lib/queries/dashboard';
import {
  currencySymbol,
  formatDate,
  formatDateFull,
  formatMinorDigits,
} from '@/lib/format';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from './empty-state';

/**
 * How many entries the phone renders before deferring to /invoices.
 * The query sorts worst-first, so these are the three that matter most.
 */
const MOBILE_ENTRIES = 3;

/**
 * §7 table: 44px rows, hairline rules, no zebra, sticky header, --row-hover —
 * at `md` and above. Below `md`, stacked entries.
 *
 * Every row here is overdue by the derived rule (due_at past, balance > 0), so
 * the badge shows `overdue` regardless of what the status column says. The
 * query layer and this table agree by construction.
 *
 * ## The table did not survive the phone, and had not been asked to
 *
 * §8 has said "below `md`, stop rendering a table" since the invoice ledger was
 * given stacked entries. This table never got them. Measured at 390x844:
 *
 * | | |
 * | --- | --- |
 * | Table width | **1126px** |
 * | Visible | **340px** |
 * | Hidden behind the scroller | **786px — 70%** |
 *
 * Seven columns — Invoice, Client, Status, Reminders, Due, Days over,
 * Outstanding — in 340px, with only the invoice number pinned. **Outstanding is
 * last in document order**, so the number this section exists to communicate
 * was the one furthest off-screen, reachable only by dragging sideways inside a
 * page already scrolling down. And the rows were not links, so there was
 * nothing to tap when you got there.
 *
 * ## What the entry leads with
 *
 * Client, amount outstanding, days over — in that order, because that is the
 * order the question is asked in: who owes, how much, how late.
 *
 * The `overdue` badge is deliberately NOT repeated on each entry below `md`.
 * Every row in a section headed "Overdue invoices" is overdue, so the badge
 * carried no information and occupied the most scannable position on the card.
 * The day count goes there instead — it is the one field that differs
 * meaningfully from one entry to the next, which is what §6 asks a repeated
 * block to provide.
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
      id="overdue"
      aria-label="Overdue invoices"
      className="rounded-md border border-line bg-surface"
    >
      <Header count={invoices.length} />

      {/* Below md: stacked entries, gap-group apart per §6. Not the folded-
          ledger treatment the invoice list uses — that is one container of
          hairline-divided rows, correct for a 25-row page of like things. These
          are alerts, each one a thing to act on, and they get their own edges so
          they read as separate items rather than one block.

          MOBILE_ENTRIES caps the list at three. Seven entries ran 899px — more
          than a full viewport for one of six blocks on a page that has to fit
          in three. Three is enough to answer "how bad is it" (the worst three
          are the ones sorted to the top) and the link below carries the rest to
          a page built for reading all of them. Nothing is hidden: the KPI tier
          above states the full count, and this says it again with a route. */}
      <ul className="flex flex-col gap-group p-4 md:hidden">
        {invoices.slice(0, MOBILE_ENTRIES).map((invoice) => (
          <li key={invoice.id}>
            <Entry invoice={invoice} />
          </li>
        ))}
        {invoices.length > MOBILE_ENTRIES ? (
          <li>
            <Link
              href="/invoices?status=overdue"
              className="flex min-h-control items-center justify-center rounded-sm border border-line-strong px-3 text-small text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
            >
              See all {invoices.length} overdue invoices
            </Link>
          </li>
        ) : null}
      </ul>

      <ScrollCue className="hidden md:block">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-[var(--sticky-top)] z-20 bg-surface px-4 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
              >
                Invoice
              </th>
              {['Client', 'Status', 'Reminders'].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="sticky top-[var(--sticky-top)] z-10 bg-surface px-3 py-2.5 text-left text-micro font-medium uppercase whitespace-nowrap text-ink-muted"
                >
                  {label}
                </th>
              ))}
              {['Due', 'Days over', 'Outstanding'].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="sticky top-[var(--sticky-top)] z-10 bg-surface px-3 py-2.5 text-right text-micro font-medium uppercase whitespace-nowrap text-ink-muted last:pr-5"
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
                  {formatMinorDigits(invoice.outstandingMinor, invoice.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollCue>
    </section>
  );
}

/**
 * One overdue invoice, below `md`.
 *
 * A link, which the table row never was — the whole entry is the target, so it
 * is 44px by construction many times over rather than by specification.
 */
function Entry({ invoice }: { invoice: OverdueInvoice }) {
  const symbol = currencySymbol(invoice.currency);

  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="flex flex-col gap-within rounded-sm border border-line bg-surface-raised px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
    >
      <div className="flex items-start justify-between gap-3">
        {/* text-h4 is the §5 step for the headline of a stacked entry. The
            client name is what identifies this row to the person reading it;
            the invoice number identifies it to the system, and sits below. */}
        <span className="text-h4 text-ink">{invoice.clientName}</span>

        {/* Where the redundant `overdue` badge used to be. Tabular figures so
            the counts compare down the list. */}
        <span className="money shrink-0 rounded-xs border border-l-[3px] border-overdue-line border-l-overdue bg-overdue-bg px-1.5 py-0.5 text-micro font-medium whitespace-nowrap text-overdue">
          {invoice.daysOverdue}d over
        </span>
      </div>

      {/* The figure the section exists to show. It was the last of seven
          columns and 786px off-screen; it is now the second line. */}
      <span className="money text-h4 text-ink">
        <span className="currency-mark">{symbol}</span>
        {formatMinorDigits(invoice.outstandingMinor, invoice.currency)}
        <span className="text-micro font-normal text-ink-muted"> outstanding</span>
      </span>

      <span className="text-micro text-ink-muted">
        <span className="money">{invoice.number}</span>
        {' · due '}
        {formatDateFull(invoice.dueAt)}
        {' · '}
        {invoice.lastReminderSequence === 0 ? (
          'no reminder sent'
        ) : (
          <>
            <span className="money">{invoice.lastReminderSequence}</span> of 3 sent
          </>
        )}
      </span>
    </Link>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3">
      <h2 className="text-h3 text-ink">Overdue invoices</h2>
      <p className="text-small text-ink-muted">
        {count === 0 ? 'none' : `${count} past due`}
      </p>
    </div>
  );
}
