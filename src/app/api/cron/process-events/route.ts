import { timingSafeEqual } from 'node:crypto';

import { processEvents } from '@/lib/processing/process-events';

/**
 * Scheduled drain. Vercel Cron issues a GET; POST is accepted so the endpoint
 * can be kicked by hand without a second route.
 *
 * `force-dynamic` because a cached cron endpoint is a cron endpoint that runs
 * once and then serves its own stale summary forever.
 */
export const dynamic = 'force-dynamic';

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Constant-time bearer comparison.
 *
 * `a === b` on a secret leaks its prefix through timing to anyone who can call
 * the endpoint repeatedly, which is everyone. The length guard is required
 * because `timingSafeEqual` throws on mismatched buffers — the same shape as
 * the session and webhook comparisons.
 */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  // Fail closed: an unconfigured secret rejects everything rather than
  // accepting everything.
  if (!expected) return false;

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;

  const provided = header.slice('Bearer '.length);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;

  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!authorized(request)) return unauthorized();

  const started = Date.now();
  const summary = await processEvents(25);

  return new Response(
    JSON.stringify({
      ...summary,
      durationMs: Date.now() - started,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const GET = handle;
export const POST = handle;
