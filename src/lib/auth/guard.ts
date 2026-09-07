import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { getSessionCookie, setSessionCookie } from './cookies';
import { validateSession } from './session';
import type { ValidatedSession } from './session';

/**
 * Absolute cap on how long a single login can live, independent of the
 * session row's 7-day idle timeout. See "Sliding renewal" below.
 */
export const SESSION_COOKIE_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/**
 * ## Sliding renewal, and why the cookie outlives the row
 *
 * `validateSession` extends the session row once it is more than halfway to
 * expiry and reports `refreshCookie: true`. But cookies can only be written in
 * a Server Function or Route Handler — never during a page render — so
 * `getCurrentSession` cannot act on that signal where it is produced.
 *
 * **Approaches considered**
 *
 * 1. *Refresh in `proxy.ts`* (Next 16's rename of middleware). It runs on every
 *    request and can set cookies, and since v16 it defaults to the Node runtime,
 *    so `node:crypto` and the Neon driver would both work there. Rejected: the
 *    Next docs explicitly say "avoid relying on Middleware unless no other
 *    options exist" and "you should not attempt relying on shared modules or
 *    globals", because proxy is designed to be hoisted to a CDN away from the
 *    app runtime. It would also add a database read and a write to every
 *    request, including requests that never look at the session.
 *
 * 2. *Defer to the next mutation.* Correct as far as it goes, but broken on its
 *    own: the row is extended on read while the cookie's `maxAge` counts down
 *    from its last write. Settled is a read-heavy dashboard, so a user who
 *    checks it daily and never mutates anything keeps their row renewed
 *    indefinitely and is still logged out at exactly 7 days.
 *
 * **Chosen: defer, with the cookie window decoupled from the row TTL.**
 *
 * - The session row's 7 days is an **idle timeout**, slid forward on read.
 * - The cookie's 30 days is an **absolute cap** on one login's lifetime.
 *
 * The row stays authoritative — an expired row is rejected however healthy the
 * cookie looks — so a longer cookie cannot extend access by itself. Deferral is
 * then safe: `commitSessionRefresh()` re-issues the cookie opportunistically
 * from any server action, and if that never happens the 30-day window covers
 * the gap regardless.
 *
 * The tradeoff is real: a stolen cookie stays presentable for up to 30 days as
 * long as the row keeps renewing. `invalidateAllUserSessions` is the remedy,
 * and being able to do that instantly is why this app uses database sessions
 * rather than JWTs in the first place. Shorten the window here if that trade
 * looks wrong for your risk posture — it is one constant.
 */
export const getCurrentSession = cache(
  async (): Promise<ValidatedSession | null> => {
    const token = await getSessionCookie();
    if (!token) return null;
    return validateSession(token);
  },
);

/**
 * Issues the session cookie with the absolute window. Login and
 * `commitSessionRefresh` both go through here so the two cannot disagree about
 * the cookie's lifetime.
 *
 * Only callable from a Server Function or Route Handler.
 */
export async function issueSessionCookie(token: string): Promise<void> {
  await setSessionCookie(
    token,
    new Date(Date.now() + SESSION_COOKIE_WINDOW_SECONDS * 1000),
  );
}

/**
 * Re-issues the cookie when sliding renewal has moved the row's expiry. Call it
 * from a server action or route handler; it is a no-op everywhere else, and a
 * no-op when no refresh is pending.
 *
 * Not required for correctness — the absolute window above already prevents the
 * cookie expiring under a live session — but it keeps the cookie's lifetime
 * tracking real activity for users who do mutate.
 */
export async function commitSessionRefresh(): Promise<void> {
  const current = await getCurrentSession();
  if (!current?.refreshCookie) return;

  const token = await getSessionCookie();
  if (!token) return;

  await issueSessionCookie(token);
}

/** Any authenticated user. Redirects to /login when there is no session. */
export async function requireUser(): Promise<ValidatedSession> {
  const current = await getCurrentSession();
  if (!current) redirect('/login');
  return current;
}

/**
 * Admin-only pages. A signed-out visitor goes to /login; a signed-in viewer
 * goes to the dashboard rather than /login, because bouncing an authenticated
 * user to a login form reads as "your session broke" rather than "you lack
 * permission".
 *
 * When `experimental.authInterrupts` is enabled, `forbidden()` from
 * next/navigation is the better answer here — it renders a 403 boundary instead
 * of navigating away. Left as a redirect until that flag is turned on.
 */
export async function requireAdmin(): Promise<ValidatedSession> {
  const current = await getCurrentSession();
  if (!current) redirect('/login');
  if (current.user.role !== 'admin') redirect('/');
  return current;
}

/** Thrown by assertCanWrite. Distinct type so callers can map it to a 403. */
export class AuthorizationError extends Error {
  readonly code = 'FORBIDDEN' as const;

  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * The first line of every mutating server action.
 *
 * Throws rather than redirects, deliberately. `redirect()` works by throwing a
 * NEXT_REDIRECT signal that Next unwinds into a navigation — inside a server
 * action that surfaces to the user as a page change, which is indistinguishable
 * from the mutation having succeeded. A write that was refused must fail
 * loudly. This throws a real Error the action can catch and turn into an error
 * result, or let bubble to the nearest error boundary.
 *
 * Note for callers: catching broadly around this will also swallow Next's own
 * NEXT_REDIRECT and NEXT_NOT_FOUND control-flow errors. Re-throw anything that
 * is not an AuthorizationError, or use `unstable_rethrow`.
 */
export async function assertCanWrite(): Promise<ValidatedSession> {
  const current = await getCurrentSession();

  if (!current) {
    throw new AuthorizationError('Not signed in.');
  }
  if (current.user.role !== 'admin') {
    throw new AuthorizationError('The viewer role cannot modify data.');
  }

  return current;
}

/**
 * True for anonymous visitors and for viewers — anyone who must not see write
 * controls. The public demo dashboard renders through this.
 *
 * This is presentation only. It hides buttons; it does not protect anything.
 * Every mutation still calls `assertCanWrite` on the server, because a hidden
 * button is not an authorisation check.
 */
export async function isReadOnly(): Promise<boolean> {
  const current = await getCurrentSession();
  return current === null || current.user.role !== 'admin';
}
