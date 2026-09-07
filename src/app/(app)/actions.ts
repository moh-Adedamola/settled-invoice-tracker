'use server';

import { redirect } from 'next/navigation';

import { clearSessionCookie, getSessionCookie } from '@/lib/auth/cookies';
import { invalidateSession } from '@/lib/auth/session';

/**
 * Sign out. A server action, so it is always a POST — never reachable by a
 * link. That matters here: the session cookie is sameSite 'lax', which means a
 * cross-site top-level GET *would* carry the cookie, so a GET logout would be
 * trivially triggerable from anywhere (`<img src="/logout">`).
 *
 * The row is deleted first, then the cookie cleared. In that order a failure
 * between the two leaves a dead cookie pointing at nothing, which is harmless.
 * The reverse order would leave a live session row with no way to reach it.
 *
 * No try/catch: `redirect()` throws NEXT_REDIRECT and must be allowed through.
 */
export async function logout(): Promise<void> {
  const token = await getSessionCookie();

  if (token) {
    await invalidateSession(token);
  }

  await clearSessionCookie();

  redirect('/');
}
