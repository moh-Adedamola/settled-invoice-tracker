import 'server-only';

import { and, eq, gte, lt, sql } from 'drizzle-orm';

import { db, loginAttempts } from '@/lib/db';

/** 5 failures in 15 minutes trips the limit. */
export const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Identifiers are namespaced rather than bare values. Two reasons: the IP and
 * email counters must be independent, and a namespace makes it impossible to
 * craft an "email" that collides with an IP counter to poison it.
 */
export const ipKey = (ip: string) => `ip:${ip.trim()}`;
export const emailKey = (email: string) => `email:${email.trim().toLowerCase()}`;

/** Records one failed attempt. Only ever called on failure. */
export async function recordAttempt(identifier: string): Promise<void> {
  if (!identifier) return;
  await db.insert(loginAttempts).values({ identifier });
}

/**
 * True once `identifier` has failed MAX_ATTEMPTS times inside the window.
 *
 * Counts rather than reads rows — the count runs entirely on the composite
 * (identifier, attempted_at) index and never returns a row to the app.
 */
export async function isRateLimited(identifier: string): Promise<boolean> {
  if (!identifier) return false;

  const since = new Date(Date.now() - WINDOW_MS);

  const [row] = await db
    .select({ attempts: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.identifier, identifier),
        gte(loginAttempts.attemptedAt, since),
      ),
    );

  return (row?.attempts ?? 0) >= MAX_ATTEMPTS;
}

/** Clears the counter after a successful login. */
export async function clearAttempts(identifier: string): Promise<void> {
  if (!identifier) return;
  await db.delete(loginAttempts).where(eq(loginAttempts.identifier, identifier));
}

/**
 * Checks the IP and email counters as two independent limits.
 *
 * Both are enforced, and both must be recorded on failure — call
 * `recordAttempt` with each key, not just one.
 *
 * **A caveat worth being honest about.** Keying on email does not prevent an
 * attacker locking out a known user; it is the mechanism by which they can.
 * Anyone who knows `accounts@molekschools.ng` can burn five requests and deny
 * that account for 15 minutes, from any IP. Separate counters buy something
 * narrower but still real: the legitimate user is not collateral damage of an
 * attack aimed at a *different* account from the same network, and an attacker
 * spraying many accounts from one IP is stopped by the IP counter after five
 * tries rather than five per account.
 *
 * If lockout DoS becomes a live concern, the fix is to make the two limits
 * asymmetric — keep the IP limit tight and raise the email threshold, or only
 * trip the email limit when failures arrive from several distinct IPs — rather
 * than to drop the email counter, which is what stops a slow distributed
 * password spray against one known account.
 */
export async function isLoginRateLimited(
  ip: string | null,
  email: string,
): Promise<boolean> {
  const keys = [ip ? ipKey(ip) : null, emailKey(email)].filter(
    (k): k is string => k !== null,
  );

  const results = await Promise.all(keys.map(isRateLimited));
  return results.some(Boolean);
}

/**
 * Housekeeping for the same cron that runs `deleteExpiredSessions`.
 *
 * Without it this table only grows: `clearAttempts` fires on success, so every
 * row left behind is a failure that was never followed by a login. Rows older
 * than the window carry no information — they cannot affect any future check.
 * Returns the number removed.
 */
export async function deleteOldAttempts(): Promise<number> {
  const deleted = await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.attemptedAt, new Date(Date.now() - WINDOW_MS)))
    .returning({ id: loginAttempts.id });

  return deleted.length;
}
