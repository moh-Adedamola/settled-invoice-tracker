import type { ActivityEntry } from '@/lib/queries/dashboard';
import { currencySymbol, formatDateTime, formatMinorDigits } from '@/lib/format';
import {
  StatusBadge,
  invoiceStatusKey,
  paymentStatusKey,
} from '@/components/ui/status-badge';
import { EmptyState } from './empty-state';

/**
 * Three record types in one stream. The union is discriminated on `kind`, so
 * each branch renders what that record actually has rather than a row of
 * nullable columns — a reminder has no amount and a payment has no sequence.
 *
 * Six entries are shown and the remainder collapse into a `<details>`. Fifteen
 * rows of three-line entries ran longer than everything above it combined and
 * turned a summary into a log.
 *
 * `<details>` rather than a state toggle: it is native, keyboard-operable,
 * survives with no JavaScript, and adds no client bundle to a surface that is
 * otherwise fully server-rendered.
 */
const VISIBLE = 6;
export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section
      aria-label="Recent activity"
      className="flex flex-col rounded-md border border-line bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle px-4 py-3">
        <h2 className="text-h3 text-ink">Recent activity</h2>
        <p className="text-small text-ink-muted">
          {entries.length <= VISIBLE
            ? `${entries.length} events`
            : `${VISIBLE} of ${entries.length}`}
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing has happened yet"
          body="Payments, issued invoices and reminders will appear here as they occur."
        />
      ) : (
        <>
          <ul className="flex flex-col">
            {entries.slice(0, VISIBLE).map((entry) => (
              <Entry key={`${entry.kind}-${entry.id}`} entry={entry} />
            ))}
          </ul>

          {entries.length > VISIBLE ? (
            <details className="group border-t border-line-subtle">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-small text-ink-secondary transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover hover:text-ink">
                <span>
                  Show {entries.length - VISIBLE} earlier
                  <span className="group-open:hidden"> events</span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-ink-muted transition-transform duration-[var(--duration-fast)] ease-standard group-open:rotate-180"
                >
                  ⌄
                </span>
              </summary>
              <ul className="flex flex-col">
                {entries.slice(VISIBLE).map((entry) => (
                  <Entry key={`${entry.kind}-${entry.id}`} entry={entry} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

function Entry({ entry }: { entry: ActivityEntry }) {
  return (
    <li className="flex items-start gap-3 border-t border-line-subtle px-4 py-2.5 first:border-t-0">
      <span
        aria-hidden="true"
        className="mt-0.5 w-4 shrink-0 text-center text-small text-ink-muted"
      >
        {entry.kind === 'payment'
          ? '↓'
          : entry.kind === 'invoice_issued'
            ? '↗'
            : '✉'}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Row entry={entry} />
        <p className="money text-small text-ink-muted">
          {formatDateTime(entry.occurredAt)}
        </p>
      </div>
    </li>
  );
}

function Row({ entry }: { entry: ActivityEntry }) {
  switch (entry.kind) {
    case 'payment': {
      const mapped = paymentStatusKey(entry.status);
      return (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-small text-ink">
              {entry.clientName ?? (
                <span className="text-ink-muted">Unmatched payment</span>
              )}
            </span>
            <span className="money text-small whitespace-nowrap text-ink">
              <span className="currency-mark">
                {currencySymbol(entry.currency)}
              </span>
              {formatMinorDigits(entry.amountMinor)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={mapped.key} label={mapped.label} />
            <span className="text-small text-ink-muted">
              {entry.provider}
              {entry.invoiceNumber ? (
                <>
                  {' · '}
                  <span className="money">{entry.invoiceNumber}</span>
                </>
              ) : (
                ' · no invoice'
              )}
            </span>
          </div>
        </>
      );
    }

    case 'invoice_issued': {
      const mapped = invoiceStatusKey(entry.status);
      return (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-small text-ink">{entry.clientName}</span>
            <span className="money text-small whitespace-nowrap text-ink">
              <span className="currency-mark">
                {currencySymbol(entry.currency)}
              </span>
              {formatMinorDigits(entry.amountMinor)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={mapped.key} label={mapped.label} />
            <span className="text-small text-ink-muted">
              issued · <span className="money">{entry.invoiceNumber}</span>
            </span>
          </div>
        </>
      );
    }

    default:
      return (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-small text-ink">{entry.clientName}</span>
            <span className="text-small whitespace-nowrap text-ink-secondary">
              Reminder <span className="money">{entry.sequence}</span>
              <span className="text-ink-muted"> of 3</span>
            </span>
          </div>
          <p className="text-small text-ink-muted">
            {entry.channel} · <span className="money">{entry.invoiceNumber}</span>
          </p>
        </>
      );
  }
}
