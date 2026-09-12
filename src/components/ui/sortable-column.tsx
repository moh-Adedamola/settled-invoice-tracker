import Link from 'next/link';

/**
 * A sortable column header — the `<th>` and its sort state together.
 *
 * This renders the cell, not just its contents, and that is the whole point.
 * `aria-sort` is defined only for the `columnheader` and `rowheader` roles, so
 * on the link inside the header it is ignored outright. Both tables had it
 * there, which meant the sort state was carried entirely by a copper underline
 * and an `aria-hidden` arrow: visible to anyone who could see the header, and
 * to nobody else. A screen reader announced fourteen rows of a table with no
 * indication of what had ordered them.
 *
 * Putting the attribute on a `<th>` the caller writes by hand is how that
 * happened twice. Emitting the `<th>` from here makes the header and its state
 * one thing, so the next table inherits the fix rather than the bug.
 *
 * `aria-sort="none"` means "sortable, not currently sorted" — it belongs on
 * every sortable column except the active one. A column that cannot be sorted
 * at all takes no `aria-sort`; write those as a plain `<th scope="col">`.
 */
export function SortableColumn({
  href,
  label,
  active,
  direction,
  align = 'left',
  className,
}: {
  href: string;
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  align?: 'left' | 'right';
  /** The caller owns the cell's styling, including its sticky/pinned position. */
  className?: string;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <Link
        href={href}
        // §7: the active column is marked with a copper underline, not an icon swap.
        className={`inline-flex items-center gap-1 rounded-xs ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${
          active
            ? 'text-ink underline decoration-accent decoration-2 underline-offset-[6px]'
            : 'hover:text-ink'
        }`}
      >
        {label}
        <span aria-hidden="true" className={active ? 'text-accent' : 'text-transparent'}>
          {active && direction === 'asc' ? '↑' : '↓'}
        </span>
      </Link>
    </th>
  );
}
