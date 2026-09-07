import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, lte } from 'drizzle-orm';

import { db, sessions, users } from '@/lib/db';
import type { UserRole } from '@/lib/db';

/** 7 days, per the auth spec. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Exported so the cookie's maxAge cannot drift from the row's expiresAt. */
export const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1000;

/** Sliding renewal fires once a session is more than halfway to expiry. */
const RENEW_AFTER_MS = SESSION_TTL_MS / 2;

/** User agent strings are attacker-controlled and unbounded; store a sane prefix. */
const MAX_USER_AGENT_CHARS = 512;

/**
 * 32 bytes = 256 bits of CSPRNG output, base64url-encoded to 43 characters.
 * base64url rather than hex because it carries the same entropy in two-thirds
 * the cookie bytes, and needs no percent-encoding in a Set-Cookie header.
 */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256, deliberately — not Argon2.
 *
 * Password hashing is slow on purpose because passwords are low-entropy: people
 * pick `settled2026`, and the KDF's cost is what stands between a leaked table
 * and a dictionary attack. A session token is not that. It is 256 bits of
 * uniform CSPRNG output, so brute-forcing it is infeasible regardless of how
 * fast the hash is — there is no dictionary to try and no structure to exploit.
 *
 * Given that, a slow KDF would be pure cost with no security return, and the
 * cost lands in the worst place: every authenticated request revalidates the
 * session, so Argon2 here would add ~50ms and 19 MiB to every single page load.
 * SHA-256 is sub-microsecond and the security argument is unchanged.
 *
 * A single unsalted pass is also what makes the lookup possible at all — the
 * digest has to be deterministic to serve as an index key.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws on length-mismatched buffers, so length is checked
 * before the buffers are built. The second check is the subtle one:
 * `Buffer.from(s, 'hex')` silently stops at the first non-hex character, so
 * two 64-character strings can decode to different byte lengths and still
 * reach the comparison. Both guards are required.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;

  return timingSafeEqual(bufA, bufB);
}

export type CreatedSession = {
  /** The raw token. Goes in the cookie and is never persisted. */
  token: string;
  sessionId: string;
  expiresAt: Date;
};

export async function createSession(
  userId: string,
  ip?: string | null,
  userAgent?: string | null,
): Promise<CreatedSession> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [row] = await db
    .insert(sessions)
    .values({
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ip: ip ?? null,
      userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_CHARS) : null,
    })
    .returning({ id: sessions.id });

  return { token, sessionId: row!.id, expiresAt };
}

export type ValidatedSession = {
  user: { id: string; email: string; role: UserRole };
  session: { id: string; expiresAt: Date };
  /**
   * True when sliding renewal extended the row. The caller must re-issue the
   * cookie with the new expiry, or the browser will drop it while the row is
   * still live.
   */
  refreshCookie: boolean;
};

/**
 * Resolves a raw cookie token to its user, or null. Expired rows are deleted on
 * sight rather than merely rejected, so an abandoned session does not linger
 * until the cron runs.
 */
export async function validateSession(
  token: string,
): Promise<ValidatedSession | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);

  const [row] = await db
    .select({
      sessionId: sessions.id,
      tokenHash: sessions.tokenHash,
      expiresAt: sessions.expiresAt,
      userId: users.id,
      email: users.email,
      role: users.role,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  // The SQL equality above already matched, so this is defence in depth: it
  // keeps the final accept/reject decision constant-time and independent of
  // how the database compares text.
  if (!timingSafeEqualHex(row.tokenHash, tokenHash)) return null;

  const now = Date.now();

  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  let expiresAt = row.expiresAt;
  let refreshCookie = false;

  if (row.expiresAt.getTime() - now <= RENEW_AFTER_MS) {
    expiresAt = new Date(now + SESSION_TTL_MS);
    await db
      .update(sessions)
      .set({ expiresAt })
      .where(eq(sessions.id, row.sessionId));
    refreshCookie = true;
  }

  return {
    user: { id: row.userId, email: row.email, role: row.role },
    session: { id: row.sessionId, expiresAt },
    refreshCookie,
  };
}

/** Sign out. Safe to call with a stale or unknown token. */
export async function invalidateSession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Sign out everywhere — password change, lost device, revoked access. */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Housekeeping for a future cron. Expired rows are already rejected by
 * validateSession, so this is table hygiene rather than a security control.
 * Returns the number of rows removed.
 */
export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lte(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });

  return deleted.length;
}
