import 'server-only';

import { cookies } from 'next/headers';

import { SESSION_TTL_SECONDS } from './session';

export const SESSION_COOKIE_NAME = 'settled_session';

/**
 * `secure` is conditional so the cookie still works on http://localhost during
 * development — a Secure cookie is simply dropped over plain HTTP, which
 * presents as "login succeeds but every subsequent request is anonymous".
 * In production this is always true.
 */
const isProduction = process.env.NODE_ENV === 'production';

/**
 * sameSite: 'lax', not 'strict'.
 *
 * Strict withholds the cookie on *every* cross-site request, including
 * top-level navigations. Settled emails invoice reminders containing links back
 * into the app, so under Strict a user clicking "View invoice" in their mail
 * client would land on the page fully logged out, be bounced to a login screen,
 * and only then see their invoice. That is the single most common way anyone
 * arrives at this app, and Strict breaks exactly it.
 *
 * Lax sends the cookie on top-level GET navigations — the email-link case —
 * while still withholding it on cross-site POST, iframe, and subresource
 * requests, which is where CSRF actually lives. The residual risk is
 * state-changing GETs, so those must not exist: every mutation is a POST or a
 * server action, never a link.
 */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
} as const;

/**
 * Pass the session's `expiresAt` so the cookie's lifetime is derived from the
 * row rather than assumed. Sliding renewal moves that date, and a cookie left
 * on the original maxAge would expire in the browser while the session row is
 * still valid.
 */
export async function setSessionCookie(
  token: string,
  expiresAt?: Date,
): Promise<void> {
  const store = await cookies();

  const maxAge = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
    : SESSION_TTL_SECONDS;

  store.set(SESSION_COOKIE_NAME, token, { ...BASE_COOKIE_OPTIONS, maxAge });
}

export async function getSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * Overwrites with an empty value at maxAge 0 rather than calling delete(), so
 * the expiry is sent with the same name/path/flags the cookie was set with.
 * A mismatch on any of those leaves the original cookie in place.
 */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, '', { ...BASE_COOKIE_OPTIONS, maxAge: 0 });
}
