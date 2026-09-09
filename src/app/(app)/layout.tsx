import type { ReactNode } from 'react';
import Link from 'next/link';

import { getCurrentSession } from '@/lib/auth/guard';
import { Sidebar } from '@/components/shell/sidebar';

import { logout } from './actions';

/**
 * Shell for both /dashboard and /demo. The two routes render the same
 * components from the same queries; only the affordances differ.
 *
 * The demo banner keys off "no session" rather than off `isReadOnly()`. A
 * signed-in viewer is read-only too, but they are looking at real books —
 * telling them their data resets nightly would be a lie.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();
  const anonymous = session === null;

  return (
    <div className="flex min-h-full flex-1 flex-col min-[900px]:flex-row">
      <Sidebar
        dashboardHref={anonymous ? '/demo' : '/dashboard'}
        anonymous={anonymous}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-end gap-4 border-b border-line-subtle px-6">
          {anonymous ? (
            <Link
              href="/login"
              className="rounded-xs text-small text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Sign in
            </Link>
          ) : (
            <>
              <span className="money text-small text-ink-secondary">
                {session.user.email}
              </span>
              <span
                aria-hidden="true"
                className="text-micro uppercase text-ink-muted"
              >
                {session.user.role}
              </span>
              {/* POST, never a link: the session cookie is sameSite lax, so a
                  cross-site GET would carry it and log the user out remotely. */}
              <form action={logout}>
                <button
                  type="submit"
                  className="inline-flex h-8 items-center rounded-sm border border-line-strong px-3 text-small text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
                >
                  Sign out
                </button>
              </form>
            </>
          )}
        </header>

        {anonymous ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line-subtle bg-surface-raised px-6 py-2.5 text-small text-ink-secondary">
            <span aria-hidden="true" className="text-ink-muted">
              ◇
            </span>
            You are viewing demo data, which resets nightly. Nothing here is a
            real client or a real payment.
            <Link
              href="/login"
              className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              Sign in to see your books
            </Link>
          </p>
        ) : null}

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
