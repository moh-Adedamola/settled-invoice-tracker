import { cronAuthorized, cronUnauthorized } from '@/lib/cron-auth';
import { reconcile, RECONCILE_WINDOW_HOURS } from '@/lib/processing/reconcile';

/**
 * The nightly gap-fill: asks each gateway what it recorded and queues anything
 * we are missing.
 *
 * Records; does not process. Every gap becomes a `webhook_events` row carrying
 * the provider's own payload, and `process-events` drains it on its own
 * schedule through exactly the code a webhook would have taken. See the header
 * of `lib/processing/reconcile.ts` for why it feeds the queue rather than
 * writing payments.
 *
 * The response is the whole point of the route. A sweep that finds nothing and
 * a sweep that is broken are both silence from the outside, so the body reports
 * per provider: rows seen, transactions checked, how many were already present,
 * how many gaps were filled, how many were already queued, and any error. Read
 * `checked: 0` with no error as suspicious rather than reassuring.
 *
 * `?hours=` overrides the 48-hour window for a one-off catch-up — after an
 * outage that outlasted it, say. Clamped to a week: a sweep that walks months
 * of history burns the provider's rate-limit budget to re-check transactions
 * every previous run already confirmed.
 *
 * 200 even when a provider errored. The summary carries the detail, and a
 * non-2xx would have an external scheduler retry a sweep whose successful
 * providers are already done.
 *
 * GET and POST both work, so it can be kicked by hand without a second route.
 * Node runtime and `force-dynamic` for the same reasons as the other crons.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_WINDOW_HOURS = 24 * 7;

async function handle(request: Request) {
  if (!cronAuthorized(request)) return cronUnauthorized();

  const requested = Number(new URL(request.url).searchParams.get('hours'));
  const hours =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_WINDOW_HOURS)
      : RECONCILE_WINDOW_HOURS;

  const started = Date.now();
  const summary = await reconcile(hours);

  return new Response(
    JSON.stringify(
      { kind: 'reconcile', windowHours: hours, ...summary, durationMs: Date.now() - started },
      null,
      2,
    ),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const GET = handle;
export const POST = handle;
