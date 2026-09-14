/**
 * A yes/no fact about CONFIGURATION — §7, "Presence marks".
 *
 * Built like a §3.4 badge but from the `paid` / `void` pair rather than a
 * green/red one, because absent is a state and not an error: most installs
 * legitimately never wire up two of the three gateways, and painting that in
 * `failed` would put a permanent alarm on a page where nothing is wrong.
 *
 * §3.3 — the marker travels with the colour, so this reads without it.
 *
 * What absence COSTS goes in `explainNo`, rendered as a `title`, so the row
 * stays scannable while the consequence is still one hover away.
 *
 * Presentational and hook-free, so a server panel and a client form can both
 * use it. It lived inside the settings page until the alerts panel needed the
 * same mark; a pattern §7 names should have one implementation, not a copy per
 * caller that drifts.
 */
export function PresenceMark({
  ok,
  yes,
  no,
  explainNo,
}: {
  ok: boolean;
  yes: string;
  no: string;
  explainNo: string;
}) {
  return (
    <span
      title={ok ? undefined : explainNo}
      className={`inline-flex items-center gap-1 rounded-xs border border-l-[3px] px-1.5 py-0.5 text-micro font-medium uppercase whitespace-nowrap ${
        ok
          ? 'border-paid-line border-l-paid bg-paid-bg text-paid'
          : 'border-void-line border-l-void bg-void-bg text-void'
      }`}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        {ok ? '●' : '—'}
      </span>
      {ok ? yes : no}
    </span>
  );
}
