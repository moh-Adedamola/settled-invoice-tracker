/**
 * §8 page header: optional breadcrumb in micro, title at text-h2 (the ceiling
 * in `(app)` — Newsreader does not load here), optional description, action
 * cluster right, 1px line-subtle bottom rule.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line-subtle px-6 py-5">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-micro uppercase text-ink-muted">{eyebrow}</p>
        ) : null}
        <h1 className="text-h2 text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 text-small text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
