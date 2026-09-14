import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Bearer check for the cron routes.
 *
 * Extracted because there are now four of them and the comparison is the kind
 * of thing that must not be re-derived per route — a fourth copy is a fourth
 * chance to write `a === b`.
 *
 * Constant-time: `===` on a secret leaks its prefix through timing to anyone
 * who can call the endpoint repeatedly, which is everyone. The length guard is
 * required because `timingSafeEqual` throws on mismatched buffers.
 *
 * Fails closed. An unconfigured `CRON_SECRET` rejects everything rather than
 * accepting everything.
 */
export function cronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return false;

  const provided = header.slice('Bearer '.length);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;

  return timingSafeEqual(a, b);
}

export function cronUnauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
