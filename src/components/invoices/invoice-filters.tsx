import Form from 'next/form';
import Link from 'next/link';

import type { InvoiceFilterOptions } from '@/lib/queries/invoices';
import { EFFECTIVE_STATUSES } from '@/lib/queries/invoice-status';
import { STATUS, invoiceStatusKey } from '@/components/ui/status-badge';

/**
 * Filters as a GET form.
 *
 * `next/form` submits by navigating, so every filter change becomes a URL the
 * user can bookmark, share or reload — and the server component reads it
 * directly. There is no client-side filter state to get out of sync with the
 * address bar, and the whole thing degrades to a plain HTML form if JavaScript
 * never arrives.
 *
 * Sort is carried through as hidden inputs: changing a filter should not throw
 * away the column someone chose to sort by. Page deliberately is NOT carried —
 * a new filter starts at page one.
 */
export function InvoiceFilters({
  options,
  selected,
}: {
  options: InvoiceFilterOptions;
  selected: {
    status: string[];
    clientId: string;
    currency: string;
    issuedFrom: string;
    issuedTo: string;
    q: string;
    sort: string;
    direction: string;
  };
}) {
  const active =
    selected.status.length > 0 ||
    Boolean(selected.clientId || selected.currency || selected.issuedFrom || selected.issuedTo || selected.q);

  const field = 'h-9 rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink';
  const label = 'text-micro uppercase text-ink-muted';

  return (
    <Form
      action="/invoices"
      className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4"
    >
      <input type="hidden" name="sort" value={selected.sort} />
      <input type="hidden" name="dir" value={selected.direction} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-2">
          <label htmlFor="q" className={label}>
            Search
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={selected.q}
            placeholder="Invoice number or client"
            className={`${field} placeholder:text-ink-muted`}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="client" className={label}>
            Client
          </label>
          <select id="client" name="client" defaultValue={selected.clientId} className={field}>
            <option value="">All clients</option>
            {options.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="currency" className={label}>
            Currency
          </label>
          <select id="currency" name="currency" defaultValue={selected.currency} className={field}>
            <option value="">Any</option>
            {options.currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="from" className={label}>
            Issued from
          </label>
          <input id="from" name="from" type="date" defaultValue={selected.issuedFrom} className={field} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="to" className={label}>
            Issued to
          </label>
          <input id="to" name="to" type="date" defaultValue={selected.issuedTo} className={field} />
        </div>
      </div>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${label} float-left mr-3 leading-9`}>Status</legend>
        {EFFECTIVE_STATUSES.map((status) => {
          // Through the same map the badges use. The derived statuses are the
          // six invoice states, not the eight presentation states — `sent`
          // presents as `pending`, so STATUS cannot be indexed directly.
          const { key, label: statusLabel } = invoiceStatusKey(status);
          const entry = STATUS[key];
          const checked = selected.status.includes(status);
          return (
            <label
              key={status}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xs border px-2 py-1 text-micro uppercase transition-colors duration-[var(--duration-fast)] ease-standard ${
                checked
                  ? `${entry.className} border-l-[3px]`
                  : 'border-line-strong text-ink-secondary hover:bg-row-hover hover:text-ink'
              }`}
            >
              <input
                type="checkbox"
                name="status"
                value={status}
                defaultChecked={checked}
                className="h-3 w-3 accent-[var(--accent)]"
              />
              {/* The marker travels with the colour — §3.3. */}
              <span aria-hidden="true" className="text-[10px] leading-none">
                {entry.marker}
              </span>
              {statusLabel}
            </label>
          );
        })}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active"
        >
          Apply filters
        </button>
        {active ? (
          <Link
            href="/invoices"
            className="rounded-xs text-small text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Clear all
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
