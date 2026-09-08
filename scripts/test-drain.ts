/**
 * Drain test harness. Runs against whatever is actually in webhook_events.
 *
 *   npm run test-drain
 *
 * Phases:
 *   1. snapshot the queue and the domain tables
 *   2. run the drain, report per-event outcomes
 *   3. show what was created
 *   4. re-run to prove idempotency — nothing new should happen
 *   5. force a failure and confirm backoff, error recording, and that the rest
 *      of the batch still completes
 *
 * Requires --conditions=react-server (wired into the npm script).
 */
import { randomBytes } from 'node:crypto';

import { and, eq, like, sql } from 'drizzle-orm';

import { db, clients, payments, webhookEvents } from '../src/lib/db';
import { processEvents } from '../src/lib/processing/process-events';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (ok) pass += 1;
  else fail += 1;
};

const RUN = randomBytes(4).toString('hex');

async function snapshot() {
  const [q] = (
    await db.execute(sql`
      select
        count(*) filter (where processed_at is null and signature_ok)::int as pending,
        count(*) filter (where processed_at is not null)::int              as processed,
        count(*) filter (where not signature_ok)::int                      as quarantined
      from webhook_events`)
  ).rows as Record<string, unknown>[];

  const [d] = (
    await db.execute(sql`
      select
        (select count(*) from clients  where not is_demo)::int as clients,
        (select count(*) from payments where not is_demo)::int as payments`)
  ).rows as Record<string, unknown>[];

  return {
    pending: Number(q!.pending),
    processed: Number(q!.processed),
    quarantined: Number(q!.quarantined),
    clients: Number(d!.clients),
    payments: Number(d!.payments),
  };
}

function report(label: string, s: Awaited<ReturnType<typeof processEvents>>) {
  console.log(
    `  ${label}: claimed ${s.claimed}, processed ${s.processed}, skipped ${s.skipped}, failed ${s.failed}`,
  );
  for (const d of s.details) {
    console.log(`    [${d.outcome.padEnd(9)}] ${d.providerEventId}`);
    if (d.note) console.log(`                  ${d.note}`);
  }
}

async function main() {
  console.log('\n================ 1. before ================\n');
  const before = await snapshot();
  console.log(
    `  queue: ${before.pending} pending, ${before.processed} processed, ${before.quarantined} quarantined`,
  );
  console.log(`  real clients: ${before.clients}   real payments: ${before.payments}`);

  console.log('\n================ 2. first drain ================\n');
  const first = await processEvents(25);
  report('run 1', first);

  check('claimed the pending verified events', first.claimed === before.pending,
    `claimed ${first.claimed}, expected ${before.pending}`);
  check('no failures on real data', first.failed === 0, `${first.failed} failed`);

  /**
   * These only mean something when the queue actually held work. The suite is
   * re-runnable, and a second run legitimately finds an empty queue — asserting
   * unconditionally would turn "nothing left to do" into a false failure.
   */
  if (before.pending > 0) {
    check('at least one charge.success processed',
      first.details.some((d) => d.outcome === 'processed' && d.providerEventId.startsWith('charge.success:')));
    check('subscription.create was skipped, not failed',
      first.details.some((d) => d.outcome === 'skipped' && d.providerEventId.startsWith('subscription.create:')));
  } else {
    console.log('  ....  queue was already drained; skipping content assertions');
  }

  console.log('\n================ 3. what was created ================\n');
  const after = await snapshot();
  console.log(`  real clients:  ${before.clients} -> ${after.clients}`);
  console.log(`  real payments: ${before.payments} -> ${after.payments}`);
  console.log(`  queue pending: ${before.pending} -> ${after.pending}`);

  const created = await db
    .select({
      providerPaymentId: payments.providerPaymentId,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      status: payments.status,
      invoiceId: payments.invoiceId,
      clientId: payments.clientId,
      baseAmountMinor: payments.baseAmountMinor,
    })
    .from(payments)
    .where(eq(payments.isDemo, false));

  for (const p of created) {
    console.log(
      `    ${p.providerPaymentId}  ${p.currency} ${p.amountMinor}  ${p.status}` +
        `  invoice=${p.invoiceId ?? 'UNMATCHED'}  base=${p.baseAmountMinor ?? 'null'}`,
    );
  }
  check('quarantined events were never touched', after.quarantined === before.quarantined,
    `${after.quarantined} still quarantined`);
  if (created.length > 0) {
    check('unmatched payment left with null invoiceId (not an error)',
      created.some((p) => p.invoiceId === null));
  } else {
    console.log('  ....  no live payments on file; skipping unmatched assertion');
  }

  console.log('\n================ 4. idempotency: second drain ================\n');
  const second = await processEvents(25);
  report('run 2', second);
  const afterSecond = await snapshot();
  check('claimed nothing', second.claimed === 0, `claimed ${second.claimed}`);
  check('created no extra payments', afterSecond.payments === after.payments,
    `${after.payments} -> ${afterSecond.payments}`);
  check('created no extra clients', afterSecond.clients === after.clients,
    `${after.clients} -> ${afterSecond.clients}`);

  console.log('\n================ 5. failure path ================\n');
  /**
   * A verified event for a provider with no adapter. The drain treats that as
   * retryable rather than permanent — the adapter may ship in a later deploy —
   * so it exercises the real backoff path with real data flow.
   *
   * A processable paystack event is inserted alongside it to prove a failure
   * does not abort the batch.
   */
  const failId = `test-failure:${RUN}`;
  const okId = `charge.success:9${RUN.slice(0, 7)}`;

  await db.insert(webhookEvents).values([
    {
      provider: 'stripe',
      providerEventId: failId,
      payload: { event: 'payment_intent.succeeded', data: { id: `pi_${RUN}` } },
      signatureOk: true,
    },
    {
      provider: 'paystack',
      providerEventId: okId,
      payload: {
        event: 'charge.success',
        data: {
          id: Number(`9${RUN.slice(0, 7).replace(/\D/g, '') || '1234567'}`),
          // Test mode, so the fixture cannot briefly create live records even
          // before cleanup runs.
          domain: 'test',
          reference: `TDRAIN${RUN}`,
          amount: 425_000,
          currency: 'NGN',
          paid_at: new Date().toISOString(),
          channel: 'card',
          customer: {
            email: `drain+${RUN}@example.test`,
            customer_code: `CUS_drain${RUN}`,
            first_name: 'Drain',
            last_name: 'Test',
          },
        },
      },
      signatureOk: true,
    },
  ]);

  const third = await processEvents(25);
  report('run 3', third);

  const [failed] = await db
    .select({
      attempts: webhookEvents.attempts,
      processedAt: webhookEvents.processedAt,
      processError: webhookEvents.processError,
      nextAttemptAt: webhookEvents.nextAttemptAt,
    })
    .from(webhookEvents)
    .where(
      and(eq(webhookEvents.provider, 'stripe'), eq(webhookEvents.providerEventId, failId)),
    );

  const backoffMinutes = failed
    ? (failed.nextAttemptAt.getTime() - Date.now()) / 60_000
    : 0;

  check('one event failed', third.failed === 1, `${third.failed} failed`);
  check('the other event still processed', third.processed === 1,
    `${third.processed} processed`);
  check('fixture recorded as demo data',
    (third.details.find((d) => d.outcome === 'processed')?.note ?? '').startsWith('TEST'));
  check('failed event is still unprocessed', failed?.processedAt === null);
  check('attempts incremented to 1', failed?.attempts === 1, `attempts=${failed?.attempts}`);
  check('error recorded', Boolean(failed?.processError),
    (failed?.processError ?? '').slice(0, 70));
  check('backoff ~1 minute for attempt 1',
    backoffMinutes > 0.5 && backoffMinutes < 1.6, `${backoffMinutes.toFixed(2)} min`);

  console.log('\n================ cleanup ================\n');
  await db.delete(webhookEvents).where(eq(webhookEvents.providerEventId, failId));
  await db.delete(payments).where(like(payments.providerPaymentId, `TDRAIN${RUN}%`));
  await db.delete(clients).where(like(clients.email, `drain+${RUN}@%`));
  await db.delete(webhookEvents).where(eq(webhookEvents.providerEventId, okId));
  console.log('  removed the two synthetic events and their records');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\n  Crashed:', error);
  process.exitCode = 1;
});
