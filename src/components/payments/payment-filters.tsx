import type { PaymentFilterOptions } from '@/lib/queries/payments';
import { PAYMENT_PROVIDERS, PAYMENT_STATUSES } from '@/lib/queries/payments';
import type { PaymentStatus } from '@/lib/db';
import { STATUS, paymentStatusKey } from '@/components/ui/status-badge';
import { FilterPanel } from '@/components/ui/filter-panel';
import { FILTER_CHIP, CHECKBOX_MARK } from '@/components/ui/control-classes';

import { PROVIDER_LABEL } from './payment-bits';

/**
 * Filters as a GET form — the same construction as the invoice ledger's, for
 * the same reasons: `next/form` navigates, so every filter state is a URL that
 * can be shared, bookmarked and reloaded, and the server component reads it
 * without any client-side state to drift.
 *
 * Sort rides through as hidden inputs; page deliberately does not, because a
 * new filter starts at page one.
 */
export function PaymentFilters({
  options,
  selected,
}: {
  options: PaymentFilterOptions;
  selected: {
    status: string[];
    provider: string[];
    currency: string;
    from: string;
    to: string;
    unmatched: boolean;
    q: string;
    sort: string;
    direction: string;
  };
}) {
  const active =
    selected.status.length > 0 ||
    selected.provider.length > 0 ||
    selected.unmatched ||
    Boolean(selected.currency || selected.from || selected.to || selected.q);

  /*
    What the collapsed row says. One short phrase per applied filter, in the
    order someone would say them out loud — the query first, because that is
    what a reader is most likely to have forgotten leaving on.

    Counts rather than lists for the multi-selects: "2 statuses" fits, "Succeeded,
    Pending" does not, and the closed row is a reminder that something is
    filtering the list rather than a full account of what.
  */
  const summary = [
    selected.q ? `"${selected.q}"` : null,
    selected.unmatched ? 'Awaiting a match' : null,
    selected.status.length === 1
      ? paymentStatusKey(selected.status[0] as PaymentStatus).label
      : selected.status.length > 1
        ? `${selected.status.length} statuses`
        : null,
    selected.provider.length === 1
      ? PROVIDER_LABEL[selected.provider[0]! as keyof typeof PROVIDER_LABEL]
      : selected.provider.length > 1
        ? `${selected.provider.length} providers`
        : null,
    selected.currency || null,
    selected.from || selected.to
      ? `${selected.from || '…'} to ${selected.to || '…'}`
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
      action="/payments"
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
            placeholder="Reference, client or invoice"
            className={`${field} placeholder:text-ink-muted`}
          />
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
            Received from
          </label>
          <input id="from" name="from" type="date" defaultValue={selected.from} className={field} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="to" className={label}>
            Received to
          </label>
          <input id="to" name="to" type="date" defaultValue={selected.to} className={field} />
        </div>
      </div>

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${label} float-left mr-3 leading-9`}>Status</legend>
        {PAYMENT_STATUSES.map((status) => {
          const { key, label: statusLabel } = paymentStatusKey(status);
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

      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${label} float-left mr-3 leading-9`}>Provider</legend>
        {PAYMENT_PROVIDERS.filter((p) => options.providers.includes(p)).map((provider) => {
          const checked = selected.provider.includes(provider);
          return (
            <label
              key={provider}
              className={`${FILTER_CHIP} ${
                checked
                  ? 'border-accent bg-accent-subtle text-ink'
                  : 'border-line-strong text-ink-secondary hover:bg-row-hover hover:text-ink'
              }`}
            >
              <input
                type="checkbox"
                name="provider"
                value={provider}
                defaultChecked={checked}
                className={CHECKBOX_MARK}
              />
              {PROVIDER_LABEL[provider]}
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {/*
          The one filter that is a question rather than a facet, so it is a
          switch rather than another checkbox in a row of them. It is also the
          only filter anyone reaches for twice a day.
        */}
        <label className="inline-flex min-h-control cursor-pointer items-center gap-2 text-small text-ink-secondary md:min-h-0">
          <input
            type="checkbox"
            name="unmatched"
            value="1"
            defaultChecked={selected.unmatched}
            className={CHECKBOX_MARK}
          />
          Only payments awaiting a match
        </label>
      </div>
    </FilterPanel>
  );
}
