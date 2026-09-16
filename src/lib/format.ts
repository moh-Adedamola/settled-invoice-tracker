import { BUSINESS_TIMEZONE } from './business-timezone';
import { currencyDecimals, LEDGER_SCALE_DIGITS } from './money';

/**
 * Money formatting. The only place minor units become text.
 *
 * Everything upstream is `bigint`; nothing here converts to `number` for
 * arithmetic. `Intl.NumberFormat` accepts a BigInt directly, so grouping the
 * major part never round-trips through a float.
 */

const SYMBOL: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
};

export function currencySymbol(currency: string): string {
  return SYMBOL[currency] ?? `${currency} `;
}

const grouper = new Intl.NumberFormat('en-US');

/** 10n ** LEDGER_SCALE_DIGITS — the divisor between stored and major units. */
const LEDGER_SCALE = 10n ** BigInt(LEDGER_SCALE_DIGITS);

/**
 * "1,850,000.00" — digits only, no symbol. Pair with `currencySymbol`.
 *
 * ## The currency is required, and it is not decoration
 *
 * Every value in this system is stored as major x 100 REGARDLESS of currency
 * (see `LEDGER_SCALE_DIGITS`), because a uniform scale is what lets two amounts
 * be added without first asking what they are denominated in. But a currency
 * with no subunit must not be WRITTEN with one: 500 yen is "500", and rendering
 * it "500.00" invents a precision the yen does not have and that no Japanese
 * reader would accept on an invoice.
 *
 * So the divisor is fixed and the number of places shown is not. That asymmetry
 * is the whole point, and it is why this takes a currency rather than reading
 * two places off the stored value.
 *
 * Half-up on the residue, matching `convertAtRate`. For a zero-decimal currency
 * the stored value should always be a multiple of 100, and the one path that
 * can break that is `multiplyByQuantity` — 2.5 x 501 yen is 1252.5 yen, a
 * quantity the currency cannot express. Rounding is the honest display of an
 * amount the ledger should not have been able to hold; the stored total stays
 * authoritative, and a line-level residue can make displayed lines sum a unit
 * away from the displayed total. Input cannot create one: `parseDecimalToMinor`
 * refuses sub-unit precision for these currencies outright.
 */
export function formatMinorDigits(minor: bigint, currency: string): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const sign = negative ? '-' : '';
  const decimals = currencyDecimals(currency);

  if (decimals === 0) {
    // Half-up into whole major units, so ¥1252.50 shows as ¥1253 rather than
    // silently losing the residue to truncation.
    const major = (abs + LEDGER_SCALE / 2n) / LEDGER_SCALE;
    return `${sign}${grouper.format(major)}`;
  }

  const major = abs / LEDGER_SCALE;
  const fraction = abs % LEDGER_SCALE;
  return `${sign}${grouper.format(major)}.${String(fraction).padStart(decimals, '0')}`;
}

/** "₦1,850,000.00" — symbol included, for contexts without a separate mark span. */
export function formatMinor(minor: bigint, currency: string): string {
  return `${currencySymbol(currency)}${formatMinorDigits(minor, currency)}`;
}

/**
 * Axis ticks only. Deliberately lossy — never use for a figure a person might
 * reconcile against. Takes major units as a number because it is a label for a
 * pixel position, not an amount.
 */
export function formatCompactMajor(major: number, currency: string): string {
  const symbol = currencySymbol(currency);
  const abs = Math.abs(major);
  if (abs >= 1_000_000) return `${symbol}${(major / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1_000) return `${symbol}${Math.round(major / 1_000)}k`;
  return `${symbol}${major}`;
}

/**
 * Dates are day-month-year, and the month is always three letters.
 *
 * en-GB gives the right order but abbreviates September as "Sept" — four
 * characters where every other month is three. The revenue chart hit this
 * first, where it left one odd label on the axis; in a date column it is worse,
 * because the year no longer lines up down the page. en-US abbreviates three
 * across the board, so the month part comes from there and the order stays
 * British.
 */
const MONTH_SHORT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  timeZone: BUSINESS_TIMEZONE,
});

function britishDate(date: Date, withYear: boolean): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: BUSINESS_TIMEZONE,
  }).formatToParts(date);

  const month = MONTH_SHORT.format(date);
  return parts.map((part) => (part.type === 'month' ? month : part.value)).join('');
}

/** "12 Mar". Rolling windows where the year is implied by the surrounding view. */
export function formatDate(date: Date): string {
  return britishDate(date, false);
}

/**
 * "12 Mar 2026". For lists that are filtered by date or that span more than a
 * year — the dashboard's rolling six months can drop the year, an archive
 * cannot.
 */
export function formatDateFull(date: Date): string {
  return britishDate(date, true);
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  });
}

/**
 * "08:29" — the time alone, in business time.
 *
 * For lists that carry the date in a group header, where repeating it on every
 * row is the repetition the header exists to remove.
 */
export function formatTime(date: Date): string {
  return date.toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  });
}

/**
 * A stable "which business day is this" key, e.g. "2026-09-15".
 *
 * `en-CA` because it is the locale that formats as ISO, which sorts and
 * compares as a string. Deliberately NOT `toISOString().slice(0, 10)`: that is
 * the UTC day, and a payment at 23:30 in Lagos is the next UTC day — grouping
 * on it would file the evening's payments under tomorrow.
 */
export function businessDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
  }).format(date);
}
