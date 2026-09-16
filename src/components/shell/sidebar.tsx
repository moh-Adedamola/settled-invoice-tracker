'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronsLeft,
  ChevronsRight,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';

const STORAGE_KEY = 'settled:sidebar-collapsed';

/**
 * localStorage read through useSyncExternalStore rather than an effect.
 *
 * Setting state inside an effect to mirror an external store causes a cascading
 * render on every mount, and React 19's lint rule rejects it. This is the
 * primitive built for the job: the server snapshot is always "expanded", the
 * client re-reads after hydration, and a `storage` event keeps two tabs in step.
 */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // private mode or blocked storage: expanded is the default
  }
}

/** Server has no storage; render expanded and let the client correct it. */
function getServerSnapshot() {
  return false;
}

function persist(next: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* not worth failing the interaction over */
  }
  for (const listener of listeners) listener();
}

type NavItem = {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  /** Inert until the route exists. Rendered, not hidden, so the shape is honest. */
  enabled: boolean;
  /**
   * Renders a record — client names, invoice numbers, sums — and so requires a
   * session. See the rule in `@/lib/auth/guard`. Shown to anonymous visitors as
   * an inert item rather than a link, because a link that only ever bounces to
   * /login is a dead end dressed as a destination.
   */
  privileged?: boolean;
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, enabled: true },
  // Not privileged: the ledger and invoice detail pages are readable signed-out,
  // scoped to demo rows. See the rule in `lib/auth/guard.ts`.
  { href: '/invoices', label: 'Invoices', Icon: FileText, enabled: true },
  { href: '/payments', label: 'Payments', Icon: Wallet, enabled: true, privileged: true },
  { href: '/clients', label: 'Clients', Icon: Users, enabled: true, privileged: true },
  { href: '/settings', label: 'Settings', Icon: Settings, enabled: true, privileged: true },
];

export function Sidebar({
  dashboardHref,
  homeHref,
  anonymous = false,
}: {
  dashboardHref: string;
  /**
   * Where the wordmark goes. See the note on the mark itself — it is the
   * dashboard for a signed-in user and the landing page for a visitor, and the
   * layout decides because only it knows which one is reading.
   */
  homeHref: string;
  anonymous?: boolean;
}) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = () => persist(!collapsed);

  const items = NAV.map((item) => {
    const href = item.href === '/dashboard' ? dashboardHref : item.href;
    const locked = anonymous && item.privileged === true;
    return {
      ...item,
      href,
      enabled: item.enabled && !locked,
      // Not-built wins over locked. Payments is both for an anonymous visitor,
      // and telling them to sign in would be a promise the route cannot keep.
      reason: !item.enabled ? 'not built yet' : 'Sign in to view',
    };
  });

  return (
    <>
      {/*
        >=900px: a rail. 900-1280 is always the 60px icon rail per §8's
        auto-collapse; >=1280 honours the persisted preference.

        ## Pinned, and it was not

        Measured on /invoices at 1440x900 before this change: `position: static`
        and a 1653px-tall box whose top was 700px above the viewport at a 700px
        scroll. The rail LOOKED anchored on a short page only because it
        stretched to the flex line, painting its ground the whole way down. Read
        a ledger to the bottom and every destination had gone with it.

        `self-start` is load-bearing. The parent is a flex row, so the default
        `align-items: stretch` was what gave this box the document's height, and
        a sticky box as tall as its own containing block can never move relative
        to it. Shrink it to its own height first, then pin it.

        `h-dvh`, not `h-screen`: on a phone in landscape the browser chrome is a
        large fraction of a small viewport, and `vh` keeps measuring the
        unretracted height. Nothing below 900px renders this rail today, but the
        rail is what a tablet in landscape gets, and dvh is right there.
      */}
      <nav
        aria-label="Main"
        data-collapsed={collapsed ? 'true' : 'false'}
        className="hidden shrink-0 flex-col border-r border-line bg-surface-raised min-[900px]:sticky min-[900px]:top-0 min-[900px]:z-30 min-[900px]:flex min-[900px]:h-dvh min-[900px]:w-[60px] min-[900px]:self-start xl:w-[248px] xl:data-[collapsed=true]:w-[60px]"
      >
        {/*
          The wordmark is the way out, and it did not used to be one.

          A visitor arriving from the landing page had no route back: the shell
          rendered no home link, so /demo was a room with no door. The mark is
          where everyone already looks for that door.

          This rail was only half the fix — it is hidden below 900px, where the
          strip is the whole of navigation. The strip carries the same mark now,
          from the same `homeHref` prop, so the door exists at every width.

          WHERE it goes depends on who is reading, which is why the href is a
          prop rather than a constant:

            signed out  ->  '/'           the landing page IS their home, and
                                          the only way back out of the demo
            signed in   ->  '/dashboard'  the app's home

          Sending a signed-in user to the landing page would drop them out of
          their books and into a sales page for the product they are already
          inside — one that opens with an entrance animation and a "Sign in"
          call to action. The convention every app shell follows is that the
          mark means "the home of this app", and mid-session that is not
          marketing.

          `aria-label` spells the name out because the visible text is split
          across two spans so the collapsed rail can show just the S, and a
          screen reader would otherwise announce it as two fragments.
        */}
        <div className="flex h-[60px] items-center border-b border-line-subtle px-2">
          <Link
            href={homeHref}
            aria-label="Settled — home"
            className="flex h-control items-center rounded-sm px-2 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
          >
            <span aria-hidden="true" className="text-h3 text-ink">
              S
            </span>
            <span
              aria-hidden="true"
              className={`text-h3 text-ink ${collapsed ? 'hidden' : 'hidden xl:inline'}`}
            >
              ettled
            </span>
          </Link>
        </div>

        {/*
          `min-h-0` before `overflow-y-auto`, in that order, or neither works: a
          flex child's default `min-height: auto` refuses to shrink below its
          content, so the list would push the collapse control off a short rail
          instead of scrolling. With the rail now height-capped at 100dvh this
          is reachable — five items at 36px clear a 640px viewport easily, but
          not a 320px-tall landscape one at a large text size.
        */}
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {items.map(({ href, label, Icon, enabled, reason }) => {
            const active = pathname === href;
            const shared =
              'flex h-control items-center gap-3 rounded-sm px-2.5 text-small transition-colors duration-[var(--duration-fast)] ease-standard';
            const labelClass = collapsed ? 'hidden' : 'hidden xl:inline';

            if (!enabled) {
              return (
                <li key={href}>
                  <span
                    aria-disabled="true"
                    title={`${label} — ${reason}`}
                    className={`${shared} cursor-not-allowed text-ink-muted opacity-60`}
                  >
                    <Icon aria-hidden="true" size={16} className="shrink-0" />
                    <span className={labelClass}>{label}</span>
                  </span>
                </li>
              );
            }

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  title={label}
                  className={`${shared} ${
                    active
                      ? 'bg-accent-subtle text-ink shadow-[inset_2px_0_0_var(--accent)]'
                      : 'text-ink-secondary hover:bg-row-hover hover:text-ink'
                  }`}
                >
                  <Icon aria-hidden="true" size={16} className="shrink-0" />
                  <span className={labelClass}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden border-t border-line-subtle p-2 xl:block">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            className="flex h-control w-full items-center gap-3 rounded-sm px-2.5 text-small text-ink-muted transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover hover:text-ink"
          >
            {collapsed ? (
              <ChevronsRight aria-hidden="true" size={16} className="shrink-0" />
            ) : (
              <ChevronsLeft aria-hidden="true" size={16} className="shrink-0" />
            )}
            <span className={collapsed ? 'hidden' : 'inline'}>Collapse</span>
          </button>
        </div>
      </nav>

      {/*
        <900px: a BOTTOM TAB BAR. See design-system.md section 8 — this replaces
        both the horizontal top strip that shipped here and the overlay drawer
        the section used to specify but never built.

        ## What the strip actually measured

        509px of items in a 360px bar, and 501px in a 354px scrollport at 390px:
        29% of the primary navigation was off-screen at rest, on every
        authenticated page, behind a scroller with no affordance announcing it.
        Clients and Settings were permanently past the fold. The keyboard
        correction directly above this comment exists because of that overflow —
        it is a workaround for a bar that never fit.

        Five destinations fit a tab bar exactly. 390 / 5 = 78px per cell against
        a 44px minimum, so nothing scrolls, nothing is discovered, and the
        reader sees every destination at rest.

        ## Why the bottom, and what it buys

        A phone is held at the bottom. More usefully: a bar pinned to the BOTTOM
        covers the end of the scrollport rather than the start, so --sticky-top
        drops to 0 below 900px and every ledger table header that used to sit
        49px down comes back to y=0. The 49px of top strip is recovered twice.

        `fixed`, not `sticky`: the bar is chrome over the viewport, not a
        participant in the document's flow. The shell pays for it with
        scroll-padding on the content — see (app)/layout.tsx.

        z-30 matches the old strip and clears the tables, whose pinned cells run
        to z-20.

        `bg-surface-raised` is the ground and has to be a real one: the token
        section 6 names for "cards, sidebar, sticky headers", opaque in both
        themes (#fdfdfb / #161c24) and one step off --bg-base, so the bar reads
        as sitting above the page rather than as a hole in it. Translucent here
        would show ledger rows travelling through the labels, which is the one
        thing this bar has to stay legible against.

        The home mark is NOT here. Five tabs is what fits; a sixth cell for a
        wordmark would cost every tab 13px and buy a destination the Dashboard
        tab already reaches. It moved to the shell header — see
        (app)/layout.tsx.
      */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom,0px)] min-[900px]:hidden"
      >
        {/*
          `grid-cols-5` rather than flex: every destination gets an identical
          cell whatever its label length, so the hit areas are predictable and
          "Settings" does not end up a wider target than "Clients". It is also
          what guarantees the 44px minimum arithmetically rather than by
          measurement — at the 320px floor a cell is still 64px wide.
        */}
        <ul className="grid h-[var(--app-tabbar-h)] grid-cols-5">
          {items.map(({ href, label, Icon, enabled, reason }) => {
            const active = pathname === href;

            /*
              The active rule is the rail's 2px accent left-edge turned ninety
              degrees onto the top of the cell — the same signal in the same
              colour, oriented to the bar it sits in. Inset shadow rather than a
              border so the cell does not change height when it activates.
            */
            const shared =
              'flex h-full flex-col items-center justify-center gap-0.5 text-micro transition-colors duration-[var(--duration-fast)] ease-standard';

            if (!enabled) {
              return (
                <li key={href}>
                  <span
                    aria-disabled="true"
                    title={`${label} — ${reason}`}
                    className={`${shared} cursor-not-allowed text-ink-muted opacity-60`}
                  >
                    <Icon aria-hidden="true" size={20} className="shrink-0" />
                    {label}
                  </span>
                </li>
              );
            }

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`${shared} ${
                    active
                      ? 'bg-accent-subtle text-accent shadow-[inset_0_2px_0_var(--accent)]'
                      : 'text-ink-secondary hover:bg-row-hover hover:text-ink'
                  }`}
                >
                  <Icon aria-hidden="true" size={20} className="shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
