import { SkeletonBlock } from '@/components/ui/skeleton';

/**
 * The fallback for the table Suspense boundary.
 *
 * Column widths and the 44px row height are copied from the real table rather
 * than guessed, so the rules and the pinned column land in the same place
 * before and after the data arrives — a skeleton that reflows is worse than no
 * skeleton at all.
 */
const COLUMN_WIDTHS = [104, 150, 74, 62, 62, 54, 92, 104];

export function InvoicesTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      {/* overflow-hidden, not just rounded: the blocks below are laid out at
          the table's column widths, which are wider than a phone. Without it
          the skeleton makes the page scroll sideways while it loads, and then
          the page snaps back when the data lands. */}
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="flex gap-6 px-4 py-2.5">
          {COLUMN_WIDTHS.map((width, i) => (
            <SkeletonBlock key={i} className="h-3 shrink-0" style={{ width: width * 0.6 }} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-11 items-center gap-6 border-t border-line-subtle px-4">
            {COLUMN_WIDTHS.map((width, j) => (
              <SkeletonBlock key={j} className="h-3.5 shrink-0" style={{ width }} />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-1">
        <SkeletonBlock className="h-3.5 w-40" />
        <SkeletonBlock className="h-8 w-56" />
      </div>

      <span className="sr-only" aria-live="polite">
        Loading invoices
      </span>
    </div>
  );
}
