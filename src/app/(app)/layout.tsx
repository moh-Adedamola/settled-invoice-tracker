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
        <header className="flex min-h-[52px] shrink-0 items-center gap-4 border-b border-line-subtle px-6 py-2">
          {/*
            The way out, below 900px only.

            The bottom tab bar carries five destinations and no wordmark — a
            sixth cell would cost every tab 13px to duplicate what the Dashboard
            tab already reaches. But the mark is not only a destination: for an
            anonymous reader in the demo it is the route back to the landing
            page, which no tab goes to. So it moves here, where it is the first
            thing in the header rather than one of six things in a bar.

            `min-[900px]:hidden` because the rail already carries its own mark at
            that width, and two would be one too many.

            `mr-auto` is what keeps the account cluster right-aligned now that
            the header is no longer `justify-end` — the mark pushes, everything
            else stays where it was.
          */}
          <Link
            href={anonymous ? '/' : '/dashboard'}
            aria-label="Settled — home"
            className="mr-auto flex h-control-sm items-center rounded-sm px-2 text-h3 text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover min-[900px]:hidden"
          >
            <span aria-hidden="true">Settled</span>
          </Link>

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
              {/*
                Who you are signed in as, and at what role — hidden below md.

                Measured at 390px with everything shown: the header wanted 577px
                of a 390px viewport and pushed the whole document into a 32%
                horizontal overflow, which in turn stretched the tab bar's grid
                to 115px cells. The touch scale is what made it unaffordable —
                the theme toggle alone is three 44px segments, 136px of a 342px
                content box, against 28px segments before.

                This is the cluster that loses, because it is the only member
                that is not a control. The mark is the way out, the toggle and
                Sign out are actions, and `admin@refacint.com · ADMIN` is a
                readout the reader can get from Settings. Truncating it instead
                was the first attempt and is worse: a clipped address is not
                identification, and it still costs the width.
              */}
              <span className="money hidden text-small text-ink-secondary md:inline">
                {session.user.email}
              </span>
              <span
                aria-hidden="true"
                className="hidden text-micro uppercase text-ink-muted md:inline"
              >
                {session.user.role}
              </span>
              {/* POST, never a link: the session cookie is sameSite lax, so a
                  cross-site GET would carry it and log the user out remotely. */}
              <form action={logout}>
                <button
                  type="submit"
                  className="inline-flex h-control-sm items-center rounded-sm border border-line-strong px-3 text-small whitespace-nowrap text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
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
              nav carried no wordmark. It is not any more — the shell header
              carries the mark below 900px, which also fixes the half of that
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

        {/*
          The tab bar is `fixed`, so it is out of flow and the document does not
          know it is there. Without this padding the last rows of every ledger
          sit underneath it — reachable by scrolling past the end on iOS, and
          simply unreachable on a browser that clamps the scroll to content.

          Padding on <main> rather than a spacer element or margin on the body:
          it scrolls with the content, it is inside the same box the page ground
          paints, and it collapses to nothing at 900px where the bar is gone.

          --app-tabbar-total already folds in env(safe-area-inset-bottom), so
          this is one number whether or not the device has a home indicator.
        */}
        <main className="min-w-0 flex-1 pb-[var(--app-tabbar-total)] min-[900px]:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
