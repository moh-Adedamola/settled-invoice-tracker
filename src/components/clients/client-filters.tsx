import { FilterPanel } from '@/components/ui/filter-panel';

/**
 * Filters as a GET form, the same arrangement the ledger uses: every filter
 * change becomes a URL you can bookmark, share or reload, there is no client
 * state to fall out of step with the address bar, and the whole thing degrades
 * to a plain HTML form if JavaScript never arrives.
 *
 * Sort rides along as hidden fields — changing a filter should not throw away
 * the column someone chose. Page deliberately does not; a new filter starts at
 * page one.
 */
export function ClientFilters({
  selected,
}: {
  selected: { q: string; archived: string; sort: string; direction: string };
}) {
  const active = selected.q !== '' || selected.archived !== '';

  const ARCHIVED_LABEL: Record<string, string> = {
    include: 'Archived shown',
    only: 'Only archived',
  };

  const summary = [
    selected.q ? `"${selected.q}"` : null,
    ARCHIVED_LABEL[selected.archived] ?? null,
  ].filter((v): v is string => Boolean(v));

  const field =
    'h-control rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink';
  const selectField =
    'h-control rounded-sm border border-line-strong px-2.5 text-small text-ink';
  const label = 'text-micro uppercase text-ink-muted';

  return (
    <FilterPanel
      action="/clients"
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
        <label htmlFor="client-q" className={label}>
          Search
        </label>
        <input
          id="client-q"
          name="q"
          type="search"
          defaultValue={selected.q}
          placeholder="Name or email"
          className={`${field} placeholder:text-ink-muted`}
        />
      </div>

      {/*
        A three-state control, not a checkbox. "Hide archived" and "show
        archived" are the two obvious states, but "only archived" is the one
        someone actually needs when reviewing what they put away — and a
        checkbox cannot say it.
      */}
      <div className="flex flex-col gap-2">
        <label htmlFor="client-archived" className={label}>
          Archived
        </label>
        <select
          id="client-archived"
          name="archived"
          defaultValue={selected.archived}
          className={selectField}
        >
          <option value="">Hidden</option>
          <option value="include">Shown</option>
          <option value="only">Only archived</option>
        </select>
      </div>

      </div>
    </FilterPanel>
  );
}
