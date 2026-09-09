/**
 * Exact minor-unit arithmetic.
 *
 * Everything here works in `bigint` and scaled integers. Nothing routes through
 * `Number`: a float multiplication on kobo reintroduces exactly the rounding
 * error the whole schema exists to keep out, and it does so silently — the
 * result is a plausible integer that happens to be a kobo wrong.
 *
 * Two scaled-integer conversions live here: `multiplyByQuantity` for
 * numeric(12,3) line quantities and `convertAtRate` for numeric(18,8) FX rates.
 * `convertAtRate` moved here from the event processor once the invoice detail
 * page needed it too — it is money arithmetic, not processing.
 */

/* ==========================================================================
   Parsing what a person typed.
   ==========================================================================

   Both the form and the server action parse through these. That is not tidiness
   either: the client shows a running total while the user types, the server
   recomputes it, and the deferred trigger rejects the write if the two disagree
   by a single kobo. Sharing the parser and `multiplyByQuantity` is what makes
   agreement structural rather than a coincidence that holds until someone
   changes a rounding rule on one side.

   Nothing here goes through `Number`. `parseFloat('0.07') * 100` is 7.000000001
   and `Math.round` hides it right up until the invoice that it does not.
   ========================================================================== */

/** ISO 4217 minor-unit exponents for the currencies this ledger handles. */
const MINOR_UNIT_DIGITS: Record<string, number> = { NGN: 2, USD: 2, GBP: 2 };

/** Two is the right default: it is what every currency here uses, and a wrong
 *  guess is caught by `too-precise` rather than silently truncating. */
export const minorUnitDigits = (currency: string): number =>
  MINOR_UNIT_DIGITS[currency] ?? 2;

/** A ledger that needs more than this has outgrown a single-tenant tracker. */
const MAX_MINOR = 10n ** 15n;

export type MoneyParseFailure =
  | 'empty'
  | 'malformed'
  | 'negative'
  | 'too-precise'
  | 'too-large';

export type ParsedMoney =
  | { ok: true; minor: bigint }
  | { ok: false; reason: MoneyParseFailure };

/**
 * Parses a decimal string to minor units, exactly.
 *
 * Grouping separators are accepted because people paste them; everything else
 * that is not a plain decimal is rejected rather than coerced. More decimal
 * places than the currency has is an error, not something to round away — a
 * user who typed 1.005 meant something, and picking one of the two neighbouring
 * kobo for them is how a total ends up one off the sum of its lines.
 */
export function parseDecimalToMinor(input: string, currency: string): ParsedMoney {
  const trimmed = input.trim().replace(/,/g, '');
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (trimmed.startsWith('-')) return { ok: false, reason: 'negative' };
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return { ok: false, reason: 'malformed' };

  const digits = minorUnitDigits(currency);
  const [whole = '', fraction = ''] = trimmed.split('.');
  if (fraction.length > digits) return { ok: false, reason: 'too-precise' };

  const minor = BigInt(`${whole}${fraction.padEnd(digits, '0')}`);
  if (minor > MAX_MINOR) return { ok: false, reason: 'too-large' };
  return { ok: true, minor };
}

export type ParsedQuantity =
  | { ok: true; value: string }
  | { ok: false; reason: 'empty' | 'malformed' | 'zero' | 'too-large' };

/**
 * Validates a quantity and returns it in the canonical `numeric(12,3)` form.
 *
 * String work throughout, for the same reason as above: `numeric(12,3)` reaches
 * further than a float carries exactly, and a quantity is a term of the
 * document rather than a measurement.
 */
export function parseQuantity(input: string): ParsedQuantity {
  const trimmed = input.trim().replace(/,/g, '');
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (!/^\d+(\.\d{0,3})?$/.test(trimmed)) return { ok: false, reason: 'malformed' };

  const [whole = '', fraction = ''] = trimmed.split('.');
  // numeric(12,3): 12 significant digits, 3 after the point, so 9 before it.
  if (whole.replace(/^0+/, '').length > 9) return { ok: false, reason: 'too-large' };

  const padded = fraction.padEnd(QUANTITY_SCALE, '0');
  if (BigInt(`${whole}${padded}`) === 0n) return { ok: false, reason: 'zero' };
  return { ok: true, value: `${whole}.${padded}` };
}

/** invoice_line_items.quantity is numeric(12,3). */
const QUANTITY_SCALE = 3;
const QUANTITY_DIVISOR = 10n ** BigInt(QUANTITY_SCALE);

/**
 * Parses a decimal string into an integer scaled by 10^scale.
 *
 * `'2.5'` at scale 3 becomes `2500n`. Extra decimals are truncated rather than
 * rounded, because the column itself cannot hold them — a value that would be
 * truncated on write is truncated here so the arithmetic matches what the
 * database stores.
 */
function scaleDecimal(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;

  const [whole = '0', fraction = ''] = unsigned.split('.');
  const scaledFraction = fraction.padEnd(scale, '0').slice(0, scale);
  const magnitude = BigInt(`${whole || '0'}${scaledFraction}`);

  return negative ? -magnitude : magnitude;
}

/**
 * quantity x unitAmountMinor, rounded half away from zero.
 *
 * THE ROUNDING RULE, stated once so every caller shares it:
 *
 *   line = round(quantity x unit), ties away from zero, in minor units.
 *
 * Worked example: 2.5 hours at ₦12,500.50/hour is 2500 x 1250050 scaled, which
 * is 3125125000; adding half a divisor (500) and dividing by 1000 gives
 * 3125125 kobo — ₦31,251.25. The half-kobo went up.
 *
 * Half *away from zero* rather than half-up so a credit note behaves as the
 * mirror of the charge it reverses: -0.5 rounds to -1, not to 0. BigInt
 * division truncates toward zero, so the sign is handled explicitly rather
 * than relying on it.
 *
 * The result is what gets STORED in `line_amount_minor`. If this rule ever
 * changes, historical invoices keep their stored totals — that is the entire
 * reason the column exists.
 */
export function multiplyByQuantity(quantity: string, unitAmountMinor: bigint): bigint {
  const scaledQuantity = scaleDecimal(quantity, QUANTITY_SCALE);
  const product = scaledQuantity * unitAmountMinor;

  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const rounded = (magnitude + QUANTITY_DIVISOR / 2n) / QUANTITY_DIVISOR;

  return negative ? -rounded : rounded;
}

/**
 * Formats a quantity for the numeric(12,3) column.
 *
 * Postgres stores `1` and `1.000` identically, but Drizzle returns whatever the
 * driver hands back, so writing a canonical form keeps round-trips predictable.
 */
export function formatQuantity(quantity: number | string): string {
  const asNumber = typeof quantity === 'number' ? quantity : Number(quantity);
  return asNumber.toFixed(QUANTITY_SCALE);
}

/**
 * The display form of the same value: `1.000` reads as `1`, `2.500` as `2.5`.
 *
 * The storage form above is canonical and padded; this one is for a person
 * scanning a column of quantities, where three zeros after every whole number
 * is noise that hides the one line that really is 2.5 hours.
 *
 * Trimmed as a string, never through `Number`. `numeric(12,3)` reaches 15
 * significant digits, which is past what a float carries exactly, and a
 * quantity is a term of the document.
 */
export function formatQuantityDisplay(quantity: string): string {
  const trimmed = quantity.trim();
  if (!trimmed.includes('.')) return trimmed;
  return trimmed.replace(/0+$/, '').replace(/\.$/, '');
}

const RATE_SCALE = 8;
const RATE_DIVISOR = 10n ** BigInt(RATE_SCALE);

/**
 * Converts minor units at a numeric(18,8) rate, entirely in bigint.
 *
 * `Number(minor) * Number(rate)` would be simpler and wrong: it reintroduces
 * float rounding into a value the whole schema exists to keep exact. The rate
 * string is scaled to an integer instead, multiplied, then divided with
 * half-up rounding.
 */
export function convertAtRate(minor: bigint, rate: string): bigint {
  const [whole, fraction = ''] = rate.trim().split('.');
  const scaledFraction = fraction.padEnd(RATE_SCALE, '0').slice(0, RATE_SCALE);
  const scaledRate = BigInt(`${whole}${scaledFraction}`);

  const product = minor * scaledRate;
  // Half-up: add half a divisor before the integer division.
  return (product + RATE_DIVISOR / 2n) / RATE_DIVISOR;
}
