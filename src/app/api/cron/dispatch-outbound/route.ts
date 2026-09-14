import { cronAuthorized, cronUnauthorized } from '@/lib/cron-auth';
import { drainReceipts } from '@/lib/mail/outbound';

/**
 * Receipts for payments that succeeded and have not been receipted.
 *
 * Idempotent by construction, not by checking: each payment is claimed with an
 * insert into `sent_emails` that a partial unique index refuses to duplicate,
 * and only a winning insert sends. Two overlapping runs cannot both send; the
 * loser takes a 23505 and reports `skipped`. See the header of
 * `lib/mail/outbound.ts` for why a failure releases the claim and a crash
 * deliberately does not.
 *
 * GET and POST both work, so it can be kicked by hand without a second route.
 * `force-dynamic` because a cached cron endpoint runs once and then serves its
 * own stale summary forever.
 *
 * Node runtime: rendering the attached PDF reads font files off disk.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  if (!cronAuthorized(request)) return cronUnauthorized();

  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 25);
  const started = Date.now();
  const summary = await drainReceipts(Number.isFinite(limit) && limit > 0 ? limit : 25);

  return new Response(
    JSON.stringify({ kind: 'receipts', ...summary, durationMs: Date.now() - started }, null, 2),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const GET = handle;
export const POST = handle;
