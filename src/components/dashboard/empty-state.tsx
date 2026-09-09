/**
 * In-app empty state. Plex Sans at `text-h2`, per the settled §5 rule:
 * Newsreader loads only in `(marketing)`, so `text-h1` here would render in the
 * fallback serif — drift, not design.
 *
 * `variant="filtered"` is the two-line case §7 describes: the user is mid-task
 * and does not want a designed moment.
 *
 * `action` is the way out of the state — a clear-filters link, a create button.
 * §7 does not describe one, because when this was written the only empty state
 * in the app was "nothing overdue", which needs no way out. Flagged.
 */
export function EmptyState({
  title,
  body,
  variant = 'first-run',
  action,
}: {
  title: string;
  body: string;
  variant?: 'first-run' | 'filtered';
  action?: React.ReactNode;
}) {
  if (variant === 'filtered') {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 px-4 py-8 text-small text-ink-muted">
        <p className="text-ink-secondary">{title}</p>
        <p>{body}</p>
        {action}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <h3 className="max-w-[420px] text-h2 text-ink">{title}</h3>
      <p className="max-w-[420px] text-small text-ink-secondary">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
