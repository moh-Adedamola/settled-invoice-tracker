/**
 * Exact minor-unit arithmetic.
 *
 * Everything here works in `bigint` and scaled integers. Nothing routes through
 * `Number`: a float multiplication on kobo reintroduces exactly the rounding
 * error the whole schema exists to keep out, and it does so silently — the
 * result is a plausible integer that happens to be a kobo wrong.
 *
 * Sibling: `convertAtRate` in src/lib/processing/process-events.ts applies the
 * same technique to numeric(18,8) FX rates. The two should eventually live
 * together here.
 */

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
