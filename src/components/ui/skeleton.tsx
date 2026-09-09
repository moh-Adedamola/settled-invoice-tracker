/**
 * §7: skeletons for page and table loading, spinners for in-place actions.
 * Blocks match the real content's box so nothing shifts when data arrives.
 *
 * The shimmer is a translating gradient; `motion-reduce:animate-none` drops it
 * to a static block, per the spec's note that reduced motion removes the
 * shimmer outright rather than slowing it.
 *
 * One definition, shared by every skeleton — two copies of a shimmer drift
 * apart the moment one of them is tuned.
 */
export function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`relative overflow-hidden rounded-xs bg-surface-raised ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-[settled-shimmer_1.4s_linear_infinite] bg-gradient-to-r from-transparent via-surface-overlay to-transparent motion-reduce:animate-none" />
    </div>
  );
}
