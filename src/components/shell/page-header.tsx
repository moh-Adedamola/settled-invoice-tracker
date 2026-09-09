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
  /**
   * A node, not just a string: an invoice number is the title of its own page
   * and §7 requires it in Plex Mono. The alternative was a `mono` boolean here
   * or a `<style>` override at the call site, and neither is the component's
   * business.
   */
  title: React.ReactNode;
  description?: string;
  /**
   * §8's breadcrumb slot. Takes a node, not just a string, because a
   * breadcrumb that cannot be a link is not a breadcrumb — it was specified as
   * one and had only ever been used for a static label.
   */
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line-subtle px-6 py-5">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-micro uppercase text-ink-muted">{eyebrow}</div>
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
