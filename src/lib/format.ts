import { BUSINESS_TIMEZONE } from './business-timezone';

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
};

export function currencySymbol(currency: string): string {
  return SYMBOL[currency] ?? `${currency} `;
}

const grouper = new Intl.NumberFormat('en-US');

/** "1,850,000.00" — digits only, no symbol. Pair with `currencySymbol`. */
export function formatMinorDigits(minor: bigint): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const major = abs / 100n;
  const fraction = abs % 100n;
  return `${negative ? '-' : ''}${grouper.format(major)}.${String(fraction).padStart(2, '0')}`;
}

/** "₦1,850,000.00" — symbol included, for contexts without a separate mark span. */
export function formatMinor(minor: bigint, currency: string): string {
  return `${currencySymbol(currency)}${formatMinorDigits(minor)}`;
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

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: BUSINESS_TIMEZONE,
  });
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
