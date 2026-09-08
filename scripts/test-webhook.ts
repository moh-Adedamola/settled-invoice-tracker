/**
 * Webhook intake test harness.
 *
 *   npm run test-webhook -- http://localhost:3000
 *   npm run test-webhook -- https://settled.vercel.app
 *
 * Builds a realistic Paystack `charge.success` payload, signs it with
 * PAYSTACK_SECRET_KEY exactly as Paystack does (HMAC-SHA512 over the raw body),
 * POSTs it, and checks what landed in `webhook_events`.
 *
 * The payload is generated, never committed: amounts, references and customer
 * details are synthesised per run, and the signing key comes from the
 * environment. Nothing here contains a real key or a real customer.
 *
 * Requires --conditions=react-server (wired into the npm script) because the
 * verification path imports server-only modules.
 */
import { createHmac, randomBytes } from 'node:crypto';

import { and, eq, like } from 'drizzle-orm';

import { db, webhookEvents } from '../src/lib/db';

const target = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!target) {
  console.error(
    '\n  Usage: npm run test-webhook -- <base-url>\n' +
      '  e.g.   npm run test-webhook -- http://localhost:3000\n',
  );
  process.exit(1);
}

const secret = process.env.PAYSTACK_SECRET_KEY;
if (!secret) {
  console.error(
    '\n  PAYSTACK_SECRET_KEY is not set.\n' +
      '  The server and this script must share the same value, or every\n' +
      '  signature will legitimately fail.\n',
  );
  process.exit(1);
}

const ENDPOINT = `${target}/api/webhooks/paystack`;

/** Distinct per run, so repeat runs never collide on the unique constraint. */
const RUN = randomBytes(4).toString('hex');
const TRANSACTION_ID = 700_000_000 + Math.floor(Math.random() * 99_999_999);
const REFERENCE = `T${Date.now()}${RUN}`;

/**
 * Shaped after a real Paystack charge.success delivery. `amount` is in the
 * subunit — 1,850,000 kobo is ₦18,500.00 — matching Paystack's own convention.
 */
function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'charge.success',
    data: {
      id: TRANSACTION_ID,
      domain: 'test',
      status: 'success',
      reference: REFERENCE,
      amount: 1_850_000,
      message: null,
      gateway_response: 'Successful',
      paid_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 45_000).toISOString(),
      channel: 'bank_transfer',
      currency: 'NGN',
      ip_address: '102.89.34.7',
      metadata: { invoice_number: `INV-2026-${1000 + (TRANSACTION_ID % 8999)}` },
      fees: 27_750,
      customer: {
        id: 180_000_000 + (TRANSACTION_ID % 999_999),
        first_name: 'Adaeze',
        last_name: 'Molek',
        email: `accounts+${RUN}@molekschools.ng`,
        customer_code: `CUS_${RUN}${randomBytes(5).toString('hex')}`,
        phone: '+2348034127788',
      },
      authorization: {
        authorization_code: `AUTH_${randomBytes(6).toString('hex')}`,
        channel: 'bank_transfer',
        bank: 'Guaranty Trust Bank',
        country_code: 'NG',
        reusable: true,
      },
      ...overrides,
    },
  };
}

const sign = (body: string) =>
  createHmac('sha512', secret).update(body, 'utf8').digest('hex');

type Result = { status: number; body: string };

async function post(rawBody: string, signature: string): Promise<Result> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-paystack-signature': signature,
    },
    body: rawBody,
  });
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (ok) pass += 1;
  else fail += 1;
};

async function rowsFor(providerEventId: string) {
  return db
    .select({
      id: webhookEvents.id,
      providerEventId: webhookEvents.providerEventId,
      signatureOk: webhookEvents.signatureOk,
      processedAt: webhookEvents.processedAt,
      attempts: webhookEvents.attempts,
    })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, 'paystack'),
        eq(webhookEvents.providerEventId, providerEventId),
      ),
    );
}

async function main() {
  console.log(`\n  endpoint : ${ENDPOINT}`);
  console.log(`  run id   : ${RUN}`);
  console.log(`  txn id   : ${TRANSACTION_ID}\n`);

  const body = JSON.stringify(buildPayload());
  const expectedEventId = `charge.success:${TRANSACTION_ID}`;

  console.log('--- 1. valid signature ---');
  const first = await post(body, sign(body));
  check('returns 200', first.status === 200, `got ${first.status} ${first.body}`);
  let rows = await rowsFor(expectedEventId);
  check('inserted exactly one row', rows.length === 1, `${rows.length} rows`);
  check('signatureOk true', rows[0]?.signatureOk === true);
  check('unprocessed (drain has not run)', rows[0]?.processedAt === null);
  check('derived event id is event:data.id', rows[0]?.providerEventId === expectedEventId,
    rows[0]?.providerEventId ?? '(none)');

  console.log('\n--- 2. same event again (provider retry) ---');
  const second = await post(body, sign(body));
  check('returns 200 on duplicate', second.status === 200,
    `got ${second.status} ${second.body}`);
  rows = await rowsFor(expectedEventId);
  check('still exactly one row', rows.length === 1, `${rows.length} rows`);

  console.log('\n--- 3. bad signature ---');
  const tampered = JSON.stringify(buildPayload({ amount: 999_999_999 }));
  const bad = await post(tampered, sign(body)); // signature of the ORIGINAL body
  check('returns 401', bad.status === 401, `got ${bad.status} ${bad.body}`);
  const unverified = await db
    .select({
      providerEventId: webhookEvents.providerEventId,
      signatureOk: webhookEvents.signatureOk,
    })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, 'paystack'),
        like(webhookEvents.providerEventId, 'unverified:%'),
      ),
    );
  check('recorded for audit with signatureOk false',
    unverified.some((r) => r.signatureOk === false), `${unverified.length} unverified rows`);
  check('quarantined in the unverified: namespace',
    unverified.every((r) => r.providerEventId.startsWith('unverified:')));

  console.log('\n--- 4. garbage signature header ---');
  const garbage = await post(body, 'not-a-signature');
  check('returns 401', garbage.status === 401, `got ${garbage.status}`);

  console.log('\n--- 5. missing signature header ---');
  const noSig = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  check('returns 401', noSig.status === 401, `got ${noSig.status}`);

  console.log('\n--- 6. unknown provider ---');
  const unknown = await fetch(`${target}/api/webhooks/monzo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  check('returns 404', unknown.status === 404, `got ${unknown.status}`);

  console.log('\n--- 7. ignored event type ---');
  const ignoredPayload = JSON.stringify({
    event: 'subscription.create',
    data: { id: TRANSACTION_ID + 1, subscription_code: `SUB_${RUN}` },
  });
  const ignored = await post(ignoredPayload, sign(ignoredPayload));
  check('returns 200 (recorded, not processed)', ignored.status === 200,
    `got ${ignored.status}`);
  const ignoredRows = await rowsFor(`subscription.create:${TRANSACTION_ID + 1}`);
  check('stored for later even though we ignore it', ignoredRows.length === 1);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  if (fail) process.exitCode = 1;
}

main().catch((error) => {
  console.error('\n  Failed:', error);
  process.exitCode = 1;
});
