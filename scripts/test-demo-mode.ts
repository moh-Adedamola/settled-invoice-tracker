/**
 * Covers the two fixes: test-mode flagging and invoiceRef sourcing.
 * Creates its own fixtures and removes them.
 */
import { randomBytes } from 'node:crypto';

import { eq, like } from 'drizzle-orm';

import { db, clients, invoices, payments, webhookEvents } from '../src/lib/db';
import { paystackAdapter } from '../src/lib/gateways/paystack';
import { processEvents } from '../src/lib/processing/process-events';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (ok) pass += 1;
  else fail += 1;
};

const RUN = randomBytes(3).toString('hex');
let txn = 820_000_000;
const nextTxn = () => ++txn;

function charge(opts: {
  id: number;
  domain?: string;
  metadata?: Record<string, unknown>;
  amount?: number;
  currency?: string;
  email?: string;
}) {
  const data: Record<string, unknown> = {
    id: opts.id,
    reference: `REF${RUN}-${opts.id}`,
    amount: opts.amount ?? 250_000,
    currency: opts.currency ?? 'NGN',
    paid_at: new Date().toISOString(),
    channel: 'card',
    customer: {
      email: opts.email ?? `mode+${RUN}@example.test`,
      customer_code: `CUS_mode${RUN}`,
      first_name: 'Mode',
      last_name: 'Test',
    },
  };
  if (opts.domain !== undefined) data.domain = opts.domain;
  if (opts.metadata !== undefined) data.metadata = opts.metadata;
  return { event: 'charge.success', data };
}

async function queue(payload: unknown, id: number) {
  await db.insert(webhookEvents).values({
    provider: 'paystack',
    providerEventId: `charge.success:${id}`,
    payload: payload as Record<string, unknown>,
    signatureOk: true,
  });
}

async function main() {
  console.log('\n=========== A. adapter: livemode ===========\n');
  const live = paystackAdapter.normalize(charge({ id: 1, domain: 'live' }));
  const test = paystackAdapter.normalize(charge({ id: 2, domain: 'test' }));
  const absent = paystackAdapter.normalize(charge({ id: 3 }));

  check('domain "live" -> livemode true', live?.livemode === true);
  check('domain "test" -> livemode false', test?.livemode === false);
  check('domain absent -> livemode true (fails safe)', absent?.livemode === true,
    'an unknown mode must never be purged as demo data');

  console.log('\n=========== B. adapter: invoiceRef ===========\n');
  const fromRefOnly = paystackAdapter.normalize(charge({ id: 4 }));
  check('transaction reference is NOT used as an invoice ref',
    fromRefOnly?.invoiceRef === undefined,
    `got ${JSON.stringify(fromRefOnly?.invoiceRef)}`);

  const fromMeta = paystackAdapter.normalize(
    charge({ id: 5, metadata: { invoice_number: 'INV-2026-0042' } }),
  );
  check('metadata.invoice_number is used', fromMeta?.invoiceRef === 'INV-2026-0042',
    String(fromMeta?.invoiceRef));

  const fromCamel = paystackAdapter.normalize(
    charge({ id: 6, metadata: { invoiceNumber: 'INV-2026-0043' } }),
  );
  check('metadata.invoiceNumber is used', fromCamel?.invoiceRef === 'INV-2026-0043');

  const fromCustom = paystackAdapter.normalize(
    charge({
      id: 7,
      metadata: {
        custom_fields: [
          { display_name: 'Cart', variable_name: 'cart_id', value: '99' },
          { display_name: 'Invoice', variable_name: 'invoice_number', value: 'INV-2026-0044' },
        ],
      },
    }),
  );
  check('metadata.custom_fields is used', fromCustom?.invoiceRef === 'INV-2026-0044',
    String(fromCustom?.invoiceRef));

  const noMeta = paystackAdapter.normalize(charge({ id: 8, metadata: { cart_id: 12 } }));
  check('unrelated metadata -> undefined', noMeta?.invoiceRef === undefined);

  console.log('\n=========== C. drain: test event -> demo records ===========\n');
  const testId = nextTxn();
  await queue(charge({ id: testId, domain: 'test' }), testId);
  let run = await processEvents(25);
  console.log(`  ${run.details[0]?.note}`);

  const [tp] = await db
    .select({ isDemo: payments.isDemo, clientId: payments.clientId })
    .from(payments)
    .where(eq(payments.providerPaymentId, `REF${RUN}-${testId}`));
  check('payment flagged isDemo', tp?.isDemo === true);
  const [tc] = await db
    .select({ isDemo: clients.isDemo })
    .from(clients)
    .where(eq(clients.id, tp!.clientId!));
  check('client flagged isDemo', tc?.isDemo === true);
  check('note marks it TEST', (run.details[0]?.note ?? '').startsWith('TEST'));

  console.log('\n=========== D. live event promotes the demo client ===========\n');
  const liveId = nextTxn();
  await queue(charge({ id: liveId, domain: 'live' }), liveId);
  run = await processEvents(25);
  console.log(`  ${run.details[0]?.note}`);

  const [lc] = await db
    .select({ isDemo: clients.isDemo })
    .from(clients)
    .where(eq(clients.id, tp!.clientId!));
  check('client promoted out of demo', lc?.isDemo === false);
  check('promotion reported in the note',
    (run.details[0]?.note ?? '').includes('promoted out of demo'));
  const [lp] = await db
    .select({ isDemo: payments.isDemo })
    .from(payments)
    .where(eq(payments.providerPaymentId, `REF${RUN}-${liveId}`));
  check('live payment is not demo', lp?.isDemo === false);
  const [stillDemo] = await db
    .select({ isDemo: payments.isDemo })
    .from(payments)
    .where(eq(payments.providerPaymentId, `REF${RUN}-${testId}`));
  check('the earlier test payment stays demo', stillDemo?.isDemo === true,
    'promotion applies to clients, never retro-flags payments');

  console.log('\n=========== E. demo boundary is not crossed ===========\n');
  const liveInvoiceNo = `INV-LIVE-${RUN}`;
  const [owner] = await db
    .insert(clients)
    .values({ name: `Boundary ${RUN}`, email: `boundary+${RUN}@example.test`, isDemo: false })
    .returning({ id: clients.id });
  await db.insert(invoices).values({
    number: liveInvoiceNo,
    clientId: owner!.id,
    amountMinor: 250_000n,
    currency: 'NGN',
    status: 'sent',
    issuedAt: new Date(),
    dueAt: new Date(Date.now() + 7 * 86_400_000),
    isDemo: false,
  });

  const crossId = nextTxn();
  await queue(
    charge({ id: crossId, domain: 'test', metadata: { invoice_number: liveInvoiceNo } }),
    crossId,
  );
  run = await processEvents(25);
  const note = run.details[0]?.note ?? '';
  console.log(`  ${note}`);

  const [crossed] = await db
    .select({ invoiceId: payments.invoiceId })
    .from(payments)
    .where(eq(payments.providerPaymentId, `REF${RUN}-${crossId}`));
  check('test payment NOT linked to the live invoice', crossed?.invoiceId === null,
    `invoiceId=${crossed?.invoiceId ?? 'null'}`);
  check('boundary explained in the note', note.includes('demo boundary'));
  const [inv] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.number, liveInvoiceNo));
  check('live invoice status untouched by the test charge', inv?.status === 'sent',
    `status=${inv?.status}`);

  console.log('\n=========== cleanup ===========\n');
  await db.delete(payments).where(like(payments.providerPaymentId, `REF${RUN}-%`));
  await db.delete(invoices).where(eq(invoices.number, liveInvoiceNo));
  await db.delete(clients).where(like(clients.email, `%${RUN}@example.test`));
  await db.delete(webhookEvents).where(like(webhookEvents.providerEventId, 'charge.success:82%'));
  console.log('  fixtures removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\n  Crashed:', error);
  process.exitCode = 1;
});
