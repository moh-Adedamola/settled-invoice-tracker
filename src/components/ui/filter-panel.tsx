'use client';

import { useId, useState } from 'react';
import Form from 'next/form';
import Link from 'next/link';

/**
 * The filter panel for every list in the app: payments, invoices, clients.
 *
 * Open at `md` and above, exactly as all three shipped. **Collapsed below it,
 * with whatever is applied named in the closed row.**
 *
 * ## What was measured
 *
 * `/payments` at 390x844: the form ran **484px — 57% of a screen** between the
 * page header and the first payment. Search, currency, two date pickers, four
 * status checkboxes, four provider checkboxes, an "only unmatched" toggle and
 * Apply, all rendered open, all with **12x12px** checkboxes. `/invoices` was
 * 472px of the same. Nobody sets a date range standing up; they came to see
 * whether the money landed.
 *
 * ## Why a client component rather than `<details>`
 *
 * `<details>` is the right primitive and cannot express this. `open` is a
 * single DOM attribute, so it cannot be false below `md` and true above it, and
 * the trick DeskSection uses — render the children twice, into a `<details>`
 * and a `<section>` — is unavailable here: duplicating form fields would
 * duplicate their `name`s and submit every filter twice.
 *
 * So the state is real, and the panel's class is what the breakpoint moves:
 * `hidden md:flex` when closed, `flex` when open. At `md` and up the closed
 * state has no effect and the toggle is not rendered.
 *
 * `aria-expanded` and `aria-controls` on a real button, rather than the
 * checkbox-hack that would have kept this server-rendered: a checkbox announces
 * itself as a checkbox, and this is a disclosure.
 *
 * ## Collapsed does not mean inactive
 *
 * The fields stay in the DOM at `display: none`, so a filter that is applied
 * keeps submitting while the panel is shut. That is the behaviour that makes
 * the summary load-bearing: the reader must be able to see what is filtering
 * their list without opening anything, or a collapsed panel becomes a place for
 * state to hide.
 */
export function FilterPanel({
  action,
  hidden,
  summary,
  active,
  children,
}: {
  /** Where the GET form submits — the list's own route. */
  action: string;
  /** Hidden inputs that must ride along, e.g. sort and direction. */
  hidden?: React.ReactNode;
  /**
   * What is currently applied, one short phrase per filter — "2 statuses",
   * "NGN", "Awaiting a match". Empty means nothing is applied.
   */
  summary: string[];
  /** True when anything is applied; drives "Clear all". */
  active: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <Form
      action={action}
      className="flex flex-col gap-group rounded-md border border-line bg-surface-raised p-4"
    >
      {hidden}

      {/*
        The closed row. Below md only — at md+ the panel is always open, so a
        control that could only ever collapse something already visible would
        be a control with nothing to do.
      */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-control items-center justify-between gap-3 rounded-sm text-left md:hidden"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-h4 text-ink">Filters</span>
          <span className="truncate text-micro text-ink-muted">
            {summary.length === 0 ? 'Showing everything' : summary.join(' · ')}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-ink-muted transition-transform duration-[var(--duration-fast)] ease-standard ${
            open ? 'rotate-180' : ''
          }`}
        >
          ⌄
        </span>
      </button>

      <div
        id={panelId}
        className={`flex-col gap-group ${open ? 'flex' : 'hidden md:flex'}`}
      >
        {children}

        <div className="flex flex-wrap items-center gap-within">
          <button
            type="submit"
            className="ring-inverse inline-flex h-control items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active"
          >
            Apply filters
          </button>
          {active ? (
            <Link
              href={action}
              className="inline-flex h-control items-center rounded-xs px-1 text-small text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Clear all
            </Link>
          ) : null}
        </div>
      </div>
    </Form>
  );
}
