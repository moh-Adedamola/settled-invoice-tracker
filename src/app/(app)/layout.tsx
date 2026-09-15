import type { ReactNode } from 'react';
import Link from 'next/link';

import { getCurrentSession } from '@/lib/auth/guard';
import { Sidebar } from '@/components/shell/sidebar';
import { ThemeToggle } from '@/components/shell/theme-toggle';

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
        homeHref={anonymous ? '/' : '/dashboard'}
        anonymous={anonymous}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          The theme control sits in the shell header, with the other per-viewer
          affordances — who you are, and signing out. Theme is the same kind of
          thing: a property of the reader, not of the data.

          Not the sidebar foot, where §8's only other persisted toggle
          (collapse) lives. That slot is `xl:block` and the rail itself is
          hidden below 900px, so a reader on a 1100px laptop or a phone would
          have no toggle at all. The header is the only chrome present at every
          width.

          §6: `gap-2` inside the cluster, which is the "between related
          controls" step, against the header's `gap-4` between clusters.
        */}
        <header className="flex h-[52px] shrink-0 items-center justify-end gap-4 border-b border-line-subtle px-6">
          <ThemeToggle />
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
            {/*
              "What Settled does" rather than "Back": a demo link gets shared,
              and the reader who opens it may never have been to the landing
              page to go back to.

              This used to be the ONLY way out on a narrow screen, because the
              <900px strip carried no wordmark. It is not any more — the strip
              has a pinned home mark now — which also fixes the half of that
              problem this banner never covered: it renders for anonymous
              visitors only, so a signed-in admin on a phone was stranded.

              Kept anyway, and not as a leftover. A mark is a mark; this says in
              words what the destination is, on the one surface where the reader
              may not yet know what Settled is. The two are different promises
              to a first-time visitor.
            */}
            <Link
              href="/"
              className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              What Settled does
            </Link>
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
