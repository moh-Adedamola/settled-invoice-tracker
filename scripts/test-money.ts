/**
 * Money: parsing, arithmetic and formatting.
 *
 *   npm run test-money
 *
 * No database, no network — this is the one test here that is pure.
 *
 * ## What it is really guarding
 *
 * Two different "decimal places" live in this system and must not be conflated:
 * every amount is STORED as major x 100 regardless of currency, while the
 * number of places it is WRITTEN with depends on the currency. The yen has no
 * subunit, so 500 yen stores as 50000 and renders as "500".
 *
 * Getting that wrong is a hundredfold error in either direction, and both wrong
 * numbers look entirely plausible beside a real invoice. There is no visual
 * tell — which is exactly why it is worth asserting rather than eyeballing.
 */
import {
  currencyDecimals,
  parseDecimalToMinor,
  multiplyByQuantity,
  convertAtRate,
  LEDGER_SCALE_DIGITS,
} from '../src/lib/money';
import { formatMinorDigits, formatMinor, currencySymbol } from '../src/lib/format';

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (ok) pass += 1;
  else fail += 1;
}

const eq = <T,>(name: string, actual: T, expected: T) =>
  check(name, actual === expected, actual === expected ? '' : `got ${String(actual)}, want ${String(expected)}`);

/* -------------------------------------------------------------------------- */

console.log('=========== 1. currency precision ===========\n');

eq('NGN has 2 decimals', currencyDecimals('NGN'), 2);
eq('USD has 2 decimals', currencyDecimals('USD'), 2);
eq('JPY has 0 decimals', currencyDecimals('JPY'), 0);
eq('KRW has 0 decimals', currencyDecimals('KRW'), 0);
eq('lowercase is accepted', currencyDecimals('jpy'), 0);
eq('an unknown currency defaults to 2', currencyDecimals('ZZZ'), 2);
// Both are zero-decimal in the world and two-decimal over Stripe's API, so the
// ledger holds them scaled like any two-decimal currency.
eq('ISK is treated as 2 (Stripe sends it two-decimal)', currencyDecimals('ISK'), 2);
eq('UGX is treated as 2 (same reason)', currencyDecimals('UGX'), 2);
eq('the storage scale is fixed at 2', LEDGER_SCALE_DIGITS, 2);

console.log('\n=========== 2. formatting: two-decimal currencies ===========\n');

eq('zero', formatMinorDigits(0n, 'NGN'), '0.00');
eq('one kobo', formatMinorDigits(1n, 'NGN'), '0.01');
eq('grouping', formatMinorDigits(185000000n, 'NGN'), '1,850,000.00');
eq('a trailing fraction survives', formatMinorDigits(249950n, 'USD'), '2,499.50');
eq('negative', formatMinorDigits(-125075n, 'USD'), '-1,250.75');
eq('symbol included', formatMinor(185000000n, 'NGN'), '₦1,850,000.00');

console.log('\n=========== 3. formatting: ZERO-decimal currencies ===========\n');

/*
 * The regression this file exists for. Stored x100 like everything else, so the
 * formatter has to divide by 100 AND then not show the two places it just
 * divided out.
 */
eq('JPY 500 renders without decimals', formatMinorDigits(50000n, 'JPY'), '500');
eq('  ...and not as 500.00', formatMinorDigits(50000n, 'JPY') !== '500.00', true);
eq('  ...and not as 50,000 (the raw stored value)', formatMinorDigits(50000n, 'JPY') !== '50,000', true);
eq('JPY grouping still applies', formatMinorDigits(125000000n, 'JPY'), '1,250,000');
eq('JPY zero', formatMinorDigits(0n, 'JPY'), '0');
eq('JPY negative', formatMinorDigits(-50000n, 'JPY'), '-500');
eq('KRW too', formatMinorDigits(1000000n, 'KRW'), '10,000');
eq('the same stored value differs by currency', formatMinorDigits(50000n, 'USD'), '500.00');

// A sub-unit residue cannot come from input, but `multiplyByQuantity` can make
// one. Displayed half-up, matching `convertAtRate`.
eq('a sub-yen residue rounds half-up', formatMinorDigits(125250n, 'JPY'), '1,253');
eq('  ...and rounds down below the half', formatMinorDigits(125240n, 'JPY'), '1,252');

console.log('\n=========== 4. parsing stores at the ledger scale ===========\n');

const parsed = (input: string, currency: string) => {
  const r = parseDecimalToMinor(input, currency);
  return r.ok ? r.minor : `rejected:${r.reason}`;
};

eq('NGN "1850000.00"', parsed('1850000.00', 'NGN'), 185000000n);
eq('NGN accepts grouping', parsed('1,850,000.00', 'NGN'), 185000000n);
eq('USD "2499.5" pads', parsed('2499.5', 'USD'), 249950n);
eq('JPY "500" stores x100', parsed('500', 'JPY'), 50000n);
eq('  ...NOT 500', parsed('500', 'JPY') !== 500n, true);
eq('JPY rejects a sub-unit amount', parsed('500.5', 'JPY'), 'rejected:too-precise');
eq('NGN still allows 2 places', parsed('500.55', 'NGN'), 50055n);
eq('NGN rejects 3 places', parsed('500.555', 'NGN'), 'rejected:too-precise');
eq('negative rejected', parsed('-5', 'NGN'), 'rejected:negative');
eq('empty rejected', parsed('', 'NGN'), 'rejected:empty');
eq('nonsense rejected', parsed('abc', 'NGN'), 'rejected:malformed');

console.log('\n=========== 5. the round trip ===========\n');

/*
 * The invoice edit form renders a stored amount back into a text field, which
 * is then reparsed on save. If those two disagree, editing an invoice without
 * touching it changes its total.
 */
for (const [currency, input] of [
  ['NGN', '1850000.00'],
  ['USD', '2499.50'],
  ['JPY', '500'],
  ['KRW', '10000'],
] as const) {
  const r = parseDecimalToMinor(input, currency);
  const back = r.ok ? formatMinorDigits(r.minor, currency).replace(/,/g, '') : 'parse failed';
  eq(`${currency} ${input} survives format(parse(x))`, back, input);
}

console.log('\n=========== 6. arithmetic is unaffected by presentation ===========\n');

// A uniform storage scale is what lets these work without knowing the currency.
eq('quantity multiplication', multiplyByQuantity('2.5', 50000n), 125000n);
eq('  ...renders as whole yen', formatMinorDigits(multiplyByQuantity('2.5', 50000n), 'JPY'), '1,250');
eq('conversion rounds half-up', convertAtRate(10000n, '1.5'), 15000n);

const lines = [50000n, 125000n, 25000n];
const total = lines.reduce((a, b) => a + b, 0n);
eq('summing mixed line amounts', total, 200000n);
eq('  ...the total renders whole', formatMinorDigits(total, 'JPY'), '2,000');
eq('  ...and lines sum to the displayed total', lines.map((l) => Number(l / 100n)).reduce((a, b) => a + b, 0), 2000);

console.log('\n=========== 7. symbols ===========\n');

eq('naira', currencySymbol('NGN'), '₦');
eq('an unknown currency falls back to its code', currencySymbol('JPY'), 'JPY ');

/* -------------------------------------------------------------------------- */

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
