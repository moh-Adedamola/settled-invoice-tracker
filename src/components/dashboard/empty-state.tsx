/**
 * In-app empty state. Plex Sans at `text-h2`, per the settled §5 rule:
 * Newsreader loads only in `(marketing)`, so `text-h1` here would render in the
 * fallback serif — drift, not design.
 *
 * `variant="filtered"` is the two-line case §7 describes: the user is mid-task
 * and does not want a designed moment.
 */
export function EmptyState({
  title,
  body,
  variant = 'first-run',
}: {
  title: string;
  body: string;
  variant?: 'first-run' | 'filtered';
}) {
  if (variant === 'filtered') {
    return (
      <div className="px-4 py-8 text-small text-ink-muted">
        <p className="text-ink-secondary">{title}</p>
        <p>{body}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <h3 className="max-w-[420px] text-h2 text-ink">{title}</h3>
      <p className="max-w-[420px] text-small text-ink-secondary">{body}</p>
    </div>
  );
}
