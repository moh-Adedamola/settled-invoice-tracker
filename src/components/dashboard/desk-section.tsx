import type { ReactNode } from 'react';

/**
 * A dashboard block that is reference at a desk and a scroll obstacle on a
 * phone: collapsed behind a disclosure below `md`, plain and open at `md` and
 * above.
 *
 * ## Why this exists
 *
 * Measured at 390x844, the dashboard ran 4096px — 4.85 viewports of blocks at
 * equal weight. Two of them answer questions nobody asks standing up: which
 * gateway brought what over six months, and a fifteen-event log. Together they
 * were 1060px, a quarter of the page, ahead of the unmatched queue.
 *
 * Neither is deleted. §8's rule for the phone is that nothing a reader would go
 * looking for may be hidden — a disclosure is not hiding, it is ranking. The
 * block states what it holds, and one tap opens it.
 *
 * ## Why the children are rendered twice
 *
 * `<details>` has no CSS-only "always open" state. `::details-content` would
 * express it exactly and is too new to rely on (no Firefox); forcing
 * `display: block` on the children does not work either, because the UA hides
 * them through the slot rather than through `display`. Making it stateful would
 * mean a client component and a hydration boundary around a static block.
 *
 * So the same children are passed to a `<details>` that only exists below `md`
 * and a `<div>` that only exists above it. The cost is duplicate DOM at one
 * width; the alternative was JavaScript to express a media query.
 */
export function DeskSection({
  title,
  aside,
  summary,
  children,
}: {
  title: string;
  /** The right-hand note in the open header — "Last 6 months", a count. */
  aside?: ReactNode;
  /**
   * What the collapsed row says beneath the title. This is the whole argument
   * for a disclosure over a cut: a reader has to be able to tell from the
   * closed state whether opening it is worth a tap.
   */
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <details className="group rounded-md border border-line bg-surface-raised md:hidden">
        <summary className="flex min-h-control cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover">
          <span className="flex flex-col gap-0.5">
            <span className="text-h3 text-ink">{title}</span>
            <span className="text-micro text-ink-muted">{summary}</span>
          </span>
          {/* Rotates with the disclosure so the control says which way it goes.
              `group-open` is Tailwind's variant for the parent's [open]. */}
          <span
            aria-hidden="true"
            className="shrink-0 text-ink-muted transition-transform duration-[var(--duration-fast)] ease-standard group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        <div className="border-t border-line-subtle">{children}</div>
      </details>

      <section
        aria-label={title}
        className="hidden flex-col rounded-md border border-line bg-surface-raised md:flex"
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle px-4 py-3">
          <h2 className="text-h3 text-ink">{title}</h2>
          {aside ? <p className="text-small text-ink-muted">{aside}</p> : null}
        </div>
        {children}
      </section>
    </>
  );
}
