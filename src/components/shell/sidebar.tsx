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
  { href: '/invoices', label: 'Invoices', Icon: FileText, enabled: true, privileged: true },
  { href: '/payments', label: 'Payments', Icon: Wallet, enabled: false, privileged: true },
  { href: '/clients', label: 'Clients', Icon: Users, enabled: true, privileged: true },
  { href: '/settings', label: 'Settings', Icon: Settings, enabled: false, privileged: true },
];

export function Sidebar({
  dashboardHref,
  anonymous = false,
}: {
  dashboardHref: string;
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
      */}
      <nav
        aria-label="Main"
        data-collapsed={collapsed ? 'true' : 'false'}
        className="hidden shrink-0 flex-col border-r border-line bg-surface-raised min-[900px]:flex min-[900px]:w-[60px] xl:w-[248px] xl:data-[collapsed=true]:w-[60px]"
      >
        <div className="flex h-[60px] items-center border-b border-line-subtle px-4">
          <span className="text-h3 text-ink">S</span>
          <span
            className={`text-h3 text-ink ${collapsed ? 'hidden' : 'hidden xl:inline'}`}
          >
            ettled
          </span>
        </div>

        <ul className="flex flex-1 flex-col gap-0.5 p-2">
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
      */}
      <nav
        aria-label="Main"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-surface-raised px-3 py-2 min-[900px]:hidden"
      >
        {items.map(({ href, label, Icon, enabled }) =>
          enabled ? (
            <Link
              key={href}
              href={href}
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
              aria-disabled="true"
              className="flex h-8 shrink-0 items-center gap-2 rounded-sm px-2.5 text-small text-ink-muted opacity-60"
            >
              <Icon aria-hidden="true" size={14} />
              {label}
            </span>
          ),
        )}
      </nav>
    </>
  );
}
