import { timingSafeEqual } from 'node:crypto';

import { DemoResetBlockedError, resetDemo } from '@/lib/demo/reset';

/**
 * Nightly demo reset. Same auth shape as /api/cron/process-events.
 *
 * Scheduled at 03:00 UTC (04:00 Africa/Lagos) from
 * .github/workflows/cron.yml — deliberately not Vercel Cron.
 */
export const dynamic = 'force-dynamic';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Constant-time bearer comparison, with the length guard `timingSafeEqual`
 * requires. Fails closed when CRON_SECRET is unset.
 */
function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;

  const a = Buffer.from(header.slice('Bearer '.length), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;

  return timingSafeEqual(a, b);
}

async function handle(request: Request) {
  if (!authorized(request)) return json(401, { error: 'Unauthorized' });

  try {
    return json(200, await resetDemo());
  } catch (error) {
    /**
     * A blocked reset is a 409, not a 500. Nothing was deleted, the database is
     * intact, and retrying will not help until a human repoints the offending
     * rows — so the response says which rows and the scheduled job goes red
     * with something actionable in the log rather than a stack trace.
     */
    if (error instanceof DemoResetBlockedError) {
      return json(409, {
        ok: false,
        error: error.message,
        dangling: error.dangling,
        hint: 'Nothing was deleted. Flag these rows as demo data or repoint them at live records.',
      });
    }

    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const GET = handle;
export const POST = handle;
