/**
 * Exercises the paths the real queue did not reach: invoice linking, partial
 * vs paid status, and the currency-mismatch rule. Creates its own fixtures and
 * removes them.
 */
import { randomBytes } from 'node:crypto';

import { eq, like } from 'drizzle-orm';

import { db, clients, invoices, payments, webhookEvents } from '../src/lib/db';
import { processEvents } from '../src/lib/processing/process-events';

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (ok) pass += 1;
  else fail += 1;
};

const RUN = randomBytes(3).toString('hex');
const INVOICE_NO = `INV-LINK-${RUN}`;
const EMAIL = `link+${RUN}@example.test`;

let txn = 810_000_000;
const nextTxn = () => ++txn;

async function queueCharge(opts: {
  amount: number;
  currency: string;
  ref: string;
  id: number;
}) {
  await db.insert(webhookEvents).values({
    provider: 'paystack',
    providerEventId: `charge.success:${opts.id}`,
    payload: {
      event: 'charge.success',
      data: {
        id: opts.id,
        reference: `LINK${RUN}-${opts.id}`,
        amount: opts.amount,
        currency: opts.currency,
        paid_at: new Date().toISOString(),
        channel: 'card',
        metadata: { invoice_number: opts.ref },
        customer: {
          email: EMAIL,
          customer_code: `CUS_link${RUN}`,
          first_name: 'Link',
          last_name: 'Test',
        },
      },
    },
    signatureOk: true,
  });
}

async function invoiceState() {
  const [row] = await db
    .select({
      status: invoices.status,
      paidAt: invoices.paidAt,
      amountMinor: invoices.amountMinor,
    })
    .from(invoices)
    .where(eq(invoices.number, INVOICE_NO));
  return row;
}

async function main() {
  console.log(`\n  fixture invoice ${INVOICE_NO} — NGN 100000 minor (₦1,000.00)\n`);

  const [client] = await db
    .insert(clients)
    .values({ name: `Link Test ${RUN}`, email: EMAIL, isDemo: false })
    .returning({ id: clients.id });

  await db.insert(invoices).values({
    number: INVOICE_NO,
    clientId: client!.id,
    amountMinor: 100_000n,
    currency: 'NGN',
    status: 'sent',
    issuedAt: new Date(Date.now() - 86_400_000),
    dueAt: new Date(Date.now() + 14 * 86_400_000),
    isDemo: false,
  });

  console.log('--- 1. partial payment (40,000 of 100,000) ---');
  const partialId = nextTxn();
  await queueCharge({ amount: 40_000, currency: 'NGN', ref: INVOICE_NO, id: partialId });
  let run = await processEvents(25);
  console.log(`  ${run.details.map((d) => d.note).join(' | ')}`);

  let inv = await invoiceState();
  check('invoice linked and marked partial', inv?.status === 'partial', `status=${inv?.status}`);
  check('paidAt still null', inv?.paidAt === null);
  const [linked] = await db
    .select({ invoiceId: payments.invoiceId })
    .from(payments)
    .where(like(payments.providerPaymentId, `LINK${RUN}-${partialId}`));
  check('payment carries the invoice id', Boolean(linked?.invoiceId));

  console.log('\n--- 2. remainder (60,000) settles it ---');
  const settleId = nextTxn();
  await queueCharge({ amount: 60_000, currency: 'NGN', ref: INVOICE_NO, id: settleId });
  run = await processEvents(25);
  console.log(`  ${run.details.map((d) => d.note).join(' | ')}`);

  inv = await invoiceState();
  check('invoice now paid', inv?.status === 'paid', `status=${inv?.status}`);
  check('paidAt set', inv?.paidAt !== null);

  console.log('\n--- 3. currency mismatch (USD payment on an NGN invoice) ---');
  const mismatchId = nextTxn();
  await queueCharge({ amount: 5_000, currency: 'USD', ref: INVOICE_NO, id: mismatchId });
  run = await processEvents(25);
  const note = run.details[0]?.note ?? '';
  console.log(`  ${note}`);

  const [mismatch] = await db
    .select({ invoiceId: payments.invoiceId, currency: payments.currency })
    .from(payments)
    .where(like(payments.providerPaymentId, `LINK${RUN}-${mismatchId}`));

  check('payment was still recorded', Boolean(mismatch));
  check('NOT linked to the invoice', mismatch?.invoiceId === null,
    `invoiceId=${mismatch?.invoiceId ?? 'null'}`);
  check('mismatch explained in the note', note.includes('currency mismatch'));
  inv = await invoiceState();
  check('invoice status untouched by the mismatch', inv?.status === 'paid',
    `status=${inv?.status}`);

  console.log('\n--- 4. client matched by provider id, not recreated ---');
  const repeatId = nextTxn();
  await queueCharge({ amount: 1_000, currency: 'NGN', ref: 'INV-DOES-NOT-EXIST', id: repeatId });
  run = await processEvents(25);
  check('reused the existing client',
    (run.details[0]?.note ?? '').startsWith('client provider'),
    run.details[0]?.note ?? '');
  const clientCount = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.email, EMAIL));
  check('exactly one client for this email', clientCount.length === 1,
    `${clientCount.length} clients`);

  console.log('\n--- cleanup ---');
  await db.delete(payments).where(like(payments.providerPaymentId, `LINK${RUN}-%`));
  await db.delete(invoices).where(eq(invoices.number, INVOICE_NO));
  await db.delete(clients).where(eq(clients.email, EMAIL));
  await db.delete(webhookEvents).where(like(webhookEvents.providerEventId, 'charge.success:81%'));
  console.log('  fixtures removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\n  Crashed:', error);
  process.exitCode = 1;
});
