/**
 * Verifies the nightly demo reset against the real database.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-reset.ts
 */
import { randomBytes } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

import { db, clients, payments, users, webhookEvents } from '../src/lib/db';
import { DemoResetBlockedError, findDanglingLiveReferences, resetDemo } from '../src/lib/demo/reset';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (ok) pass += 1;
  else fail += 1;
};

const RUN = randomBytes(3).toString('hex');
const LIVE_EMAIL = `survivor+${RUN}@example.test`;

async function counts() {
  const [r] = (
    await db.execute(sql`
      select
        (select count(*) from clients  where is_demo)::int      as demo_clients,
        (select count(*) from invoices where is_demo)::int      as demo_invoices,
        (select count(*) from payments where is_demo)::int      as demo_payments,
        (select count(*) from reminders)::int                   as reminders,
        (select count(*) from clients  where not is_demo)::int  as live_clients,
        (select count(*) from payments where not is_demo)::int  as live_payments,
        (select count(*) from users)::int                       as users,
        (select count(*) from fx_rates)::int                    as fx_rates,
        (select count(*) from webhook_events)::int              as webhook_events`)
  ).rows as Record<string, unknown>[];
  return Object.fromEntries(
    Object.entries(r!).map(([k, v]) => [k, Number(v)]),
  ) as Record<string, number>;
}

async function main() {
  console.log('\n=========== setup ===========\n');

  const [admin] = await db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .limit(1);
  console.log(`  existing admin: ${admin?.email ?? '(none)'}`);
  const adminHashBefore = admin?.passwordHash ?? null;

  // A live client that must survive every reset untouched.
  const [liveClient] = await db
    .insert(clients)
    .values({ name: `Survivor ${RUN}`, email: LIVE_EMAIL, isDemo: false })
    .returning({ id: clients.id });
  console.log(`  created live client ${LIVE_EMAIL}`);

  // A processed test-mode webhook event that retention should remove.
  await db.insert(webhookEvents).values({
    provider: 'paystack',
    providerEventId: `reset-test:${RUN}`,
    payload: { event: 'charge.success', data: { id: 1, domain: 'test' } },
    signatureOk: true,
    processedAt: new Date(),
  });
  // An unprocessed verified event that retention must KEEP.
  await db.insert(webhookEvents).values({
    provider: 'paystack',
    providerEventId: `reset-keep:${RUN}`,
    payload: { event: 'charge.success', data: { id: 2, domain: 'test' } },
    signatureOk: true,
  });
  console.log('  queued one processed test event and one unprocessed event');

  const before = await counts();
  console.log(`\n  before: ${JSON.stringify(before)}`);

  console.log('\n=========== 1. safety check blocks a dangling reference ===========\n');
  // A live payment pointing at a demo client — exactly the FK hazard.
  const [demoClient] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.isDemo, true))
    .limit(1);

  const [hazard] = await db
    .insert(payments)
    .values({
      clientId: demoClient!.id,
      provider: 'manual',
      providerPaymentId: `HAZARD-${RUN}`,
      amountMinor: 1000n,
      currency: 'NGN',
      status: 'succeeded',
      occurredAt: new Date(),
      isDemo: false, // live payment -> demo client
    })
    .returning({ id: payments.id });

  const dangling = await findDanglingLiveReferences();
  check('dangling reference detected', dangling.length >= 1, `${dangling.length} found`);
  check('names the offending record',
    dangling.some((d) => d.label === `HAZARD-${RUN}`),
    dangling.map((d) => `${d.kind} ${d.label} -> ${d.references}`).join('; '));

  let blocked = false;
  try {
    await resetDemo();
  } catch (error) {
    blocked = error instanceof DemoResetBlockedError;
    if (blocked) console.log(`  refused: ${(error as Error).message.slice(0, 140)}...`);
  }
  check('resetDemo refused to run', blocked);

  const during = await counts();
  check('nothing was deleted', during.demo_clients === before.demo_clients,
    `demo clients ${before.demo_clients} -> ${during.demo_clients}`);

  await db.delete(payments).where(eq(payments.id, hazard!.id));
  console.log('  hazard removed');

  console.log('\n=========== 2. reset runs clean ===========\n');
  const summary = await resetDemo();
  console.log(`  purged   ${JSON.stringify(summary.purged)}`);
  console.log(`  inserted ${JSON.stringify(summary.inserted)}`);
  console.log(`  admin    ${summary.admin}`);
  console.log(`  took     ${summary.durationMs}ms`);

  const after = await counts();
  check('demo clients back to 14', after.demo_clients === 14, `${after.demo_clients}`);
  check('demo invoices reseeded', after.demo_invoices > 40, `${after.demo_invoices}`);
  check('demo payments reseeded', after.demo_payments > 30, `${after.demo_payments}`);
  check('reminders reseeded', after.reminders > 10, `${after.reminders}`);

  console.log('\n=========== 3. what must survive ===========\n');
  const [survivor] = await db
    .select({ id: clients.id, isDemo: clients.isDemo })
    .from(clients)
    .where(eq(clients.email, LIVE_EMAIL));
  check('live client survived', survivor?.id === liveClient!.id);
  check('live client still not demo', survivor?.isDemo === false);

  const [adminAfter] = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, admin!.email));
  check('admin user survived', Boolean(adminAfter));
  check('admin password hash unchanged', adminAfter?.passwordHash === adminHashBefore,
    'the reset must never log you out of your own product');
  check('user count unchanged', after.users === before.users,
    `${before.users} -> ${after.users}`);
  /**
   * fx_rates is never purged, so it only ever grows. The seeder writes 30 days
   * of USD->NGN and GBP->NGN pinned to 06:00 UTC, so a reset on a new calendar
   * day adds exactly two rows (today's pair) and re-inserts nothing else — the
   * (base, quote, fetched_at) unique plus onConflictDoNothing sees to that.
   * Growth is ~730 rows/year, which is the price of never deleting a rate the
   * app may have used for a real conversion.
   */
  const fxAdded = after.fx_rates - before.fx_rates;
  check('fx_rates never shrinks', fxAdded >= 0, `${before.fx_rates} -> ${after.fx_rates}`);
  check('fx_rates grew by at most one day of rates', fxAdded <= 2,
    `added ${fxAdded} (2 = today's USD + GBP)`);

  console.log('\n=========== 4. webhook retention ===========\n');
  const [purged] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.providerEventId, `reset-test:${RUN}`));
  check('processed test-mode event removed', purged === undefined);

  const [kept] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.providerEventId, `reset-keep:${RUN}`));
  check('unprocessed event KEPT (pending work)', kept !== undefined,
    'deleting these would silently drop unprocessed payments');

  console.log('\n=========== 5. idempotency ===========\n');
  const second = await resetDemo();
  const afterSecond = await counts();
  check('second run succeeded', second.ok === true);
  check('demo counts identical', afterSecond.demo_clients === after.demo_clients &&
    afterSecond.demo_invoices === after.demo_invoices, JSON.stringify({
      clients: `${after.demo_clients} -> ${afterSecond.demo_clients}`,
      invoices: `${after.demo_invoices} -> ${afterSecond.demo_invoices}`,
    }));
  check('live client still there after two resets',
    (await db.select({ id: clients.id }).from(clients).where(eq(clients.email, LIVE_EMAIL))).length === 1);
  check('admin still there', afterSecond.users === before.users);
  check('second run adds no fx rates', afterSecond.fx_rates === after.fx_rates,
    `${after.fx_rates} -> ${afterSecond.fx_rates}`);

  console.log('\n=========== cleanup ===========\n');
  await db.delete(clients).where(eq(clients.email, LIVE_EMAIL));
  await db.delete(webhookEvents).where(eq(webhookEvents.providerEventId, `reset-keep:${RUN}`));
  console.log('  removed the test fixtures');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\n  Crashed:', error);
  process.exitCode = 1;
});
