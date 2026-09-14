import { cronAuthorized, cronUnauthorized } from '@/lib/cron-auth';
import { drainReceipts } from '@/lib/mail/outbound';
import { drainAlerts } from '@/lib/notify/alerts';

/**
 * Receipts for payments that succeeded, and Telegram alerts for what moved.
 *
 * Idempotent by construction, not by checking: each payment is claimed with an
 * insert that a partial unique index refuses to duplicate, and only a winning
 * insert sends. Receipts claim on `sent_emails`, alerts on `telegram_alerts`.
 * Two overlapping runs cannot both send; the loser takes a 23505 and reports
 * `skipped`. See the header of `lib/mail/outbound.ts` for why a failure
 * releases the claim and a crash deliberately does not.
 *
 * ## The two channels are independent, and the code makes that structural
 *
 * They are settled with `allSettled`, not awaited in sequence and not `all`.
 * Both alternatives couple them: in sequence, a receipt drain that throws never
 * reaches the alerts; with `all`, the first rejection abandons the other
 * channel's summary even though that work already happened.
 *
 * `allSettled` means a Telegram outage cannot cost a client their receipt, a
 * Resend outage cannot cost the owner their notification, and the response
 * reports on each separately — so "did anything go out" is answerable per
 * channel rather than being one shared verdict.
 *
 * The status stays 200 whenever the run itself completed, whatever the channels
 * report. A cron caller that retries on non-2xx would otherwise re-drive a run
 * whose claims are already recorded; the body carries the detail.
 *
 * GET and POST both work, so it can be kicked by hand without a second route.
 * `force-dynamic` because a cached cron endpoint runs once and then serves its
 * own stale summary forever.
 *
 * Node runtime: rendering the attached PDF reads font files off disk.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Turns a settled result into something JSON-serialisable either way. */
function report(result: PromiseSettledResult<unknown>) {
  return result.status === 'fulfilled'
    ? result.value
    : {
        error:
          result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
}

async function handle(request: Request) {
  if (!cronAuthorized(request)) return cronUnauthorized();

  const requested = Number(new URL(request.url).searchParams.get('limit') ?? 25);
  const limit = Number.isFinite(requested) && requested > 0 ? requested : 25;
  const started = Date.now();

  const [receipts, alerts] = await Promise.allSettled([
    drainReceipts(limit),
    drainAlerts(limit),
  ]);

  return new Response(
    JSON.stringify(
      {
        kind: 'outbound',
        receipts: report(receipts),
        alerts: report(alerts),
        durationMs: Date.now() - started,
      },
      null,
      2,
    ),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const GET = handle;
export const POST = handle;
