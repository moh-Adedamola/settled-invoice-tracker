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

  /**
   * Keep the keyboard-focused strip item fully inside the scroller.
   *
   * Chrome will not scroll for an element that is only PARTIALLY out of view:
   * focus scrolling aligns "nearest", and "nearest" is a no-op the moment any
   * part of the box is inside the scrollport. Measured at 360/390/430/500px,
   * that is exactly the case that keeps happening here — walking the strip with
   * Tab and Shift+Tab always left one item clipped at an edge with focus on it,
   * `Invoices` at −24px, `Dashboard` at −63px with 6px of itself showing. The
   * ring was outside the scrollport and the label was unreadable.
   *
   * `scroll-padding-left` does not reach it. The padding is honoured when Chrome
   * does decide to scroll — with it, an item fully off the left edge lands at
   * 38px instead of −137px — but it cannot make Chrome scroll in the first
   * place, and the partially-clipped case is the one that matters.
   *
   * This predates the home mark: the strip has always overflowed (509px of items
   * in a 360px bar) and has always been able to park focus on a clipped item.
   * The mark narrows the scrollport by 36px, which makes it worse, so it is
   * fixed here rather than left.
   *
   * React's `onFocus` is `focusin`, so it bubbles and one listener covers every
   * item. Setting `scrollLeft` directly is deliberate: this is a correction to a
   * jump the browser already made, not a movement of its own, and animating it
   * would be motion the reader did not ask for. `--duration-*` collapses under
   * reduced motion anyway; there is nothing here to collapse.
   */
  const keepFocusedItemInView = (event: React.FocusEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    const item = (event.target as HTMLElement).closest<HTMLElement>('[data-nav-item]');
    if (!item) return;

    const port = scroller.getBoundingClientRect();
    const box = item.getBoundingClientRect();
    // 8px so the item clears the edge rather than sitting flush against it —
    // a focus ring drawn at the boundary is still half a ring.
    const gutter = 8;

    if (box.left < port.left) scroller.scrollLeft -= port.left - box.left + gutter;
    else if (box.right > port.right) scroller.scrollLeft += box.right - port.right + gutter;
  };

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
            className="flex h-9 items-center rounded-sm px-2 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
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
              'flex h-9 items-center gap-3 rounded-sm px-2.5 text-small transition-colors duration-[var(--duration-fast)] ease-standard';
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
            className="flex h-9 w-full items-center gap-3 rounded-sm px-2.5 text-small text-ink-muted transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover hover:text-ink"
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
        <900px: §8 specifies an overlay drawer. Not built — this is a horizontal
        strip instead, which keeps every destination reachable without a
        half-finished drawer. Flagged in the handover.

        ## Pinned to the top

        "Keeps every destination reachable" was only true above the fold. The
        strip is the ONLY navigation a phone gets — there is no rail and no
        drawer — so scrolling a ledger left a visitor with no way to anywhere
        except the browser's back button.

        `bg-surface-raised` is the ground, and it has to be a real one:
        `--bg-raised` is the token §6 names for "cards, sidebar, sticky
        headers", it is opaque in both themes (#fdfdfb / #161c24), and it is one
        step off `--bg-base` so the strip reads as sitting above the page rather
        than being a hole in it. A translucent fill here would show ledger rows
        travelling through the words, which is the thing this bar exists to stay
        legible against. The landing masthead takes the opposite treatment for
        the opposite reason — see `masthead-plate` in globals.css.

        z-30 clears the tables. Their pinned cells run to z-20 (the corner cell,
        which is sticky on both axes), so 30 is the first step above the ledger
        rather than an arbitrary large number.

        Height is pinned to --app-nav-h so it cannot drift from the offset the
        ledger headers and the focus clearance are computing against.

        ## Two boxes, and that is the whole trick

        The mark is a SIBLING of the scroller, not a child of it. The bar is a
        flex row: an unscrolling mark, then a scrollport holding the items.

        The obvious build is one scroller with the mark `sticky left-0` inside
        it, and it was built that way first. It fails on the keyboard. Measured
        at 360/390/430/500px, shift-tabbing back along the strip always left
        exactly one item sitting partly under the mark — Invoices at −27px at
        360, Dashboard at −67px at 430 — and no amount of `scroll-padding-left`
        moved it. The padding IS honoured (with it, an item fully off the left
        edge lands at 38px instead of −137px), but Chrome will not scroll for an
        element that is only PARTIALLY out of view: focus scrolling aligns
        "nearest", and "nearest" is a no-op when any part of the box is already
        inside the scrollport. So the one case that matters is the one case the
        CSS cannot reach.

        Taking the mark out of the scrollport removes the failure instead of
        papering over it. Nothing can slide under a box that is not in the
        scrolling area, there is no overlap to correct, and the mark needs no
        z-index, no opaque ground of its own and no scroll padding. Items now
        clip at the divider rather than travelling beneath it, which is also the
        more honest edge — the rule is where the scrolling region starts.
      */}
      <nav
        aria-label="Main"
        className="sticky top-0 z-30 flex h-[var(--app-nav-h)] shrink-0 items-center border-b border-line bg-surface-raised min-[900px]:hidden"
      >
        {/*
          The way out, and below 900px it did not exist.

          The rail got a home link last round, but the rail is not what a phone
          renders — this strip is, and it carried no mark. The only other route
          out was the demo banner's "What Settled does", which renders for
          anonymous visitors ONLY, so a signed-in admin on a phone had no way
          back to anything except the browser's back button.

          Same `homeHref` the rail uses, from the same prop, decided by the same
          rule in the layout: '/' signed out (the landing page is their home and
          the only way out of the demo), '/dashboard' signed in (mid-session,
          "home" is not a sales page).

          ## One letter below 640px, the wordmark above it

          The rail already collapses to "S" between 900 and 1280 — this is that
          treatment, at the width where it earns more. The strip overflows by
          175px at 360px before the mark is added at all: five items need 509px
          of a 360px bar. Every pixel the mark takes is a pixel of nav that has
          to be scrolled to, so while the items overflow, "S" (34px) over
          "Settled" (80px) is 46px of real estate that buys nothing.

          640px is where it stops being a trade: items (509) + gutters + the
          full wordmark still fit, and measured at `sm` the strip's overflow is
          0. So the mark can be spelled out exactly when spelling it out is free.

          The border-r is what stops a bare "S" reading as a nav item that lost
          its label — the same separation the rail draws under its own mark,
          turned ninety degrees. It doubles as the edge of the scrolling region.

          `aria-label` spells the name because the visible text is split across
          two spans so the collapsed state can show just the S, and a screen
          reader would otherwise announce it as two fragments. The label does
          not change with the width, so neither does what is announced.
        */}
        <Link
          href={homeHref}
          aria-label="Settled — home"
          className="flex h-full shrink-0 items-center border-r border-line-subtle px-3 text-h3 text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
        >
          <span aria-hidden="true">S</span>
          <span aria-hidden="true" className="hidden sm:inline">
            ettled
          </span>
        </Link>

        <div
          onFocus={keepFocusedItemInView}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-2"
        >
          {items.map(({ href, label, Icon, enabled }) =>
            enabled ? (
              <Link
                key={href}
                href={href}
                data-nav-item=""
                aria-current={pathname === href ? 'page' : undefined}
                className={`flex h-8 shrink-0 items-center gap-2 rounded-sm px-2.5 text-small ${
                  pathname === href
                    ? 'bg-accent-subtle text-ink'
                    : 'text-ink-secondary'
                }`}
              >
                <Icon aria-hidden="true" size={14} />
                {label}
              </Link>
            ) : (
              <span
                key={href}
                data-nav-item=""
                aria-disabled="true"
                className="flex h-8 shrink-0 items-center gap-2 rounded-sm px-2.5 text-small text-ink-muted opacity-60"
              >
                <Icon aria-hidden="true" size={14} />
                {label}
              </span>
            ),
          )}
        </div>
      </nav>
    </>
  );
}
