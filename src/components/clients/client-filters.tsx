import Form from 'next/form';
import Link from 'next/link';

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

  const field =
    'h-9 rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink';
  const selectField = 'h-9 rounded-sm border border-line-strong px-2.5 text-small text-ink';
  const label = 'text-micro uppercase text-ink-muted';

  return (
    <Form
      action="/clients"
      className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-raised p-4"
    >
      <input type="hidden" name="sort" value={selected.sort} />
      <input type="hidden" name="dir" value={selected.direction} />

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

      <button
        type="submit"
        className="ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active"
      >
        Apply filters
      </button>

      {active ? (
        <Link
          href="/clients"
          className="inline-flex h-9 items-center rounded-xs text-small text-accent underline underline-offset-2 hover:text-accent-hover"
        >
          Clear all
        </Link>
      ) : null}
    </Form>
  );
}
