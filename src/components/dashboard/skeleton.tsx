import { SkeletonBlock as Block } from '@/components/ui/skeleton';

/**
 * §7: skeletons for page and table loading, spinners for in-place actions.
 * Blocks match the real content's box so nothing shifts when data arrives.
 *
 * The shimmering block itself now lives in `@/components/ui/skeleton` — the
 * invoices list needed the same treatment, and one shimmer is easier to keep
 * honest than two.
 */
export function DashboardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border border-line bg-surface-raised p-4"
          >
            <Block className="h-3 w-20" />
            <Block className="h-7 w-36" />
            <Block className="h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="rounded-md border border-line bg-surface-raised p-4">
        <Block className="mb-4 h-4 w-24" />
        <Block className="h-[240px] w-full" />
      </div>

      <div className="rounded-md border border-line bg-surface">
        <div className="border-b border-line-subtle px-4 py-3">
          <Block className="h-4 w-40" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="border-t border-line-subtle px-4 py-3 first:border-t-0">
            <Block className="h-4 w-full" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-md border border-line bg-surface-raised">
            <div className="border-b border-line-subtle px-4 py-3">
              <Block className="h-4 w-28" />
            </div>
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 4 }, (_, j) => (
                <Block key={j} className="h-4 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      <span className="sr-only" aria-live="polite">
        Loading dashboard
      </span>
    </div>
  );
}
