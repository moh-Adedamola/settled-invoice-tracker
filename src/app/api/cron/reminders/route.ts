import { cronAuthorized, cronUnauthorized } from '@/lib/cron-auth';
import { drainReminders } from '@/lib/mail/outbound';

/**
 * The reminder ladder.
 *
 * Thresholds and the master on/off come from the settings row, so this respects
 * whatever the Settings page says rather than the historical 3/7/14. With
 * reminders switched off the drain returns zero candidates and sends nothing —
 * the switch is honoured in the query, not by a guard the sender could forget.
 *
 * Idempotent by construction: a rung is claimed by inserting into `reminders`,
 * whose `unique(invoice_id, sequence)` makes a double-send impossible even
 * across two servers. Nothing checks first; the insert IS the check.
 *
 * An invoice that is far past due and has never been chased gets the rung it
 * has reached, not every rung below it — `max(l.sequence)` in the candidate
 * query, so twenty days late is one third letter rather than three letters at
 * once.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  if (!cronAuthorized(request)) return cronUnauthorized();

  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 25);
  const started = Date.now();
  const summary = await drainReminders(Number.isFinite(limit) && limit > 0 ? limit : 25);

  return new Response(
    JSON.stringify({ kind: 'reminders', ...summary, durationMs: Date.now() - started }, null, 2),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

export const GET = handle;
export const POST = handle;
