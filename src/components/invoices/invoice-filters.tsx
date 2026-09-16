import type { InvoiceFilterOptions } from '@/lib/queries/invoices';
import { EFFECTIVE_STATUSES } from '@/lib/queries/invoice-status';
import type { EffectiveStatus } from '@/lib/queries/invoice-status';
import { STATUS, invoiceStatusKey } from '@/components/ui/status-badge';
import { FilterPanel } from '@/components/ui/filter-panel';
import { FILTER_CHIP, CHECKBOX_MARK } from '@/components/ui/control-classes';

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

  /* The collapsed row — see FilterPanel. Counts rather than lists for the
     multi-select, because "3 statuses" fits a 340px row and the status names
     do not. */
  const clientName = selected.clientId
    ? options.clients.find((c) => c.id === selected.clientId)?.name
    : undefined;

  const summary = [
    selected.q ? `"${selected.q}"` : null,
    clientName ?? null,
    selected.status.length === 1
      ? invoiceStatusKey(selected.status[0] as EffectiveStatus).label
      : selected.status.length > 1
        ? `${selected.status.length} statuses`
        : null,
    selected.currency || null,
    selected.issuedFrom || selected.issuedTo
      ? `${selected.issuedFrom || '…'} to ${selected.issuedTo || '…'}`
      : null,
  ].filter((v): v is string => Boolean(v));

  const field =
    'h-control rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink';
  // No bg-transparent: a select keeps the bg-overlay ground @layer base gives
  // it, which is what the OS paints the native popup from. See §7.
  const selectField =
    'h-control rounded-sm border border-line-strong px-2.5 text-small text-ink';
  const label = 'text-micro uppercase text-ink-muted';

  return (
    <FilterPanel
      action="/invoices"
      active={active}
      summary={summary}
      hidden={
        <>
          <input type="hidden" name="sort" value={selected.sort} />
          <input type="hidden" name="dir" value={selected.direction} />
        </>
      }
    >

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
          <select id="client" name="client" defaultValue={selected.clientId} className={selectField}>
            <option value="">All clients</option>
            {options.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="currency" className={label}>
            Currency
          </label>
          <select id="currency" name="currency" defaultValue={selected.currency} className={selectField}>
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
              className={`${FILTER_CHIP} ${
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
                className={CHECKBOX_MARK}
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

    </FilterPanel>
  );
}
