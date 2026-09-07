'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { verifyPassword } from '@/lib/auth/password';
import { createSession } from '@/lib/auth/session';
import { issueSessionCookie } from '@/lib/auth/guard';
import {
  clearAttempts,
  emailKey,
  ipKey,
  isRateLimited,
  recordAttempt,
} from '@/lib/auth/rate-limit';
import { db, users } from '@/lib/db';

/**
 * The only message the client ever sees for a failed credential check. It must
 * not distinguish "no such user" from "wrong password" — anything finer is an
 * account-enumeration oracle.
 */
const GENERIC_FAILURE = 'That email and password combination is not recognised.';

/**
 * The rate-limit message is deliberately NOT generic. A locked-out legitimate
 * user needs to know why they are stuck and that waiting fixes it; telling an
 * attacker they hit the limit reveals nothing they cannot infer from being
 * blocked anyway.
 */
const RATE_LIMITED =
  'Too many sign-in attempts. Wait 15 minutes and try again.';

const LoginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginState = {
  formError?: string;
  fieldErrors?: { email?: string; password?: string };
  /** Echoed back so a failed submit does not clear the email field. */
  email?: string;
};

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is a comma-separated chain where the leftmost entry is the
 * original client. Caveat worth knowing: this header is client-settable unless
 * a trusted proxy overwrites it. On Vercel it is set by the platform and safe;
 * behind a bare Node server it is spoofable, which means an attacker can evade
 * the per-IP limit by rotating the header. The per-email limit is what still
 * bites in that case.
 */
async function readClientIp(): Promise<string | null> {
  const h = await headers();

  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  return h.get('x-real-ip')?.trim() || null;
}

/**
 * There is deliberately no try/catch anywhere in this action.
 *
 * `redirect()` signals by throwing NEXT_REDIRECT, which Next unwinds into a
 * navigation. A broad catch would swallow it and the form would appear to do
 * nothing on a *successful* login — the worst possible failure mode, because
 * the session cookie is already set by then. If a catch is ever added here, it
 * must re-throw anything that is not a known error type, or call
 * `unstable_rethrow`.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  });

  const submittedEmail = String(formData.get('email') ?? '').trim();

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      email: submittedEmail,
      fieldErrors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  const { email, password } = parsed.data;
  const normalisedEmail = email.toLowerCase();

  const ip = await readClientIp();
  const ipIdentifier = ip ? ipKey(ip) : null;
  const emailIdentifier = emailKey(normalisedEmail);

  // Checked before any database work, and checked independently so a lockout on
  // one key does not depend on the other.
  const [ipLimited, emailLimited] = await Promise.all([
    ipIdentifier ? isRateLimited(ipIdentifier) : Promise.resolve(false),
    isRateLimited(emailIdentifier),
  ]);

  if (ipLimited || emailLimited) {
    return { email: submittedEmail, formError: RATE_LIMITED };
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, normalisedEmail))
    .limit(1);

  /**
   * Verification runs unconditionally, including when no user matched.
   *
   * `verifyPassword` routes any non-Argon2 input — the empty string here, and
   * the seed script's placeholder sentinel — through its decoy hash, burning
   * the same ~40ms as a real check. Short-circuiting on `!user` instead would
   * answer in microseconds and turn response latency into a reliable "is this
   * email registered?" oracle.
   */
  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? '',
    password,
  );

  if (!user || !passwordMatches) {
    await Promise.all([
      ipIdentifier ? recordAttempt(ipIdentifier) : Promise.resolve(),
      recordAttempt(emailIdentifier),
    ]);

    return { email: submittedEmail, formError: GENERIC_FAILURE };
  }

  await Promise.all([
    ipIdentifier ? clearAttempts(ipIdentifier) : Promise.resolve(),
    clearAttempts(emailIdentifier),
  ]);

  const requestHeaders = await headers();
  const session = await createSession(
    user.id,
    ip,
    requestHeaders.get('user-agent'),
  );

  await issueSessionCookie(session.token);

  // Last statement, outside any control flow that could catch the throw.
  redirect('/dashboard');
}
