/**
 * The business timezone, validated once at module load.
 *
 * Everything that buckets, compares or formats a date does it in this zone —
 * SQL via `AT TIME ZONE`, JavaScript via `Intl`. See the timezone note at the
 * top of `src/lib/queries/dashboard.ts`.
 *
 * Deliberately NOT `server-only`: `src/lib/format.ts` imports this and is
 * reachable from client components. On the client `process.env` carries no
 * unprefixed variables, so the fallback applies there and validation is a
 * no-op. That is safe today because every date formatted for display is
 * formatted on the server; if a client component ever formats a date directly,
 * it would silently use the default zone rather than the configured one, and
 * this constant would need promoting to `NEXT_PUBLIC_`.
 */

export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Lagos';

function resolveBusinessTimezone(): string {
  const configured = process.env.BUSINESS_TIMEZONE?.trim();

  if (!configured) return DEFAULT_BUSINESS_TIMEZONE;

  // Construction rather than `Intl.supportedValuesOf('timeZone')`: that list is
  // canonical names only and rejects legitimate aliases such as
  // `Asia/Calcutta`, which both Intl and Postgres accept.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: configured });
  } catch {
    throw new Error(
      `BUSINESS_TIMEZONE is not a valid IANA time zone: "${configured}". ` +
        `Expected a zone name such as "${DEFAULT_BUSINESS_TIMEZONE}" or ` +
        `"Europe/London". Fix the value in .env.local, or remove it to fall ` +
        `back to "${DEFAULT_BUSINESS_TIMEZONE}".`,
    );
  }

  return configured;
}

/**
 * Throws at import time on a bad value, so a typo fails the boot instead of
 * surfacing as a 500 on the first dashboard render.
 *
 * One gap worth knowing: this validates against the JavaScript ICU database.
 * Postgres keeps its own, and the two overlap but are not identical, so a zone
 * Intl accepts could still be rejected by `AT TIME ZONE`. In practice that only
 * happens with very obscure or newly added zones; the check catches typos,
 * which is the failure this is actually guarding against.
 */
export const BUSINESS_TIMEZONE = resolveBusinessTimezone();
