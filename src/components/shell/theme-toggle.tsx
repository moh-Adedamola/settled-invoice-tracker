'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import {
  applyTheme,
  isThemeChoice,
  THEME_STORAGE_KEY,
  type ThemeChoice,
} from '@/lib/theme';

/* ==========================================================================
   Theme toggle.
   ==========================================================================

   Read through `useSyncExternalStore`, the same primitive the sidebar collapse
   uses and for the same reason: mirroring an external store into state inside
   an effect causes a cascading render on every mount and React 19's
   `set-state-in-effect` rule rejects it. The store here is localStorage, the
   subscription is the `storage` event, and the consequence is that two open
   tabs stay in step without either of them polling.

   The server snapshot is `system`, because the server cannot read a browser's
   storage and must not guess. The real value arrives at hydration — by which
   point the blocking head script has ALREADY stamped the attribute, so the
   painted theme is correct and only this control's pressed state settles.
   ========================================================================== */

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    // Storage blocked. "system" is the honest answer: nothing is persisted, so
    // the OS preference is genuinely what governs.
    return 'system';
  }
}

/** No storage on the server. `system` is the only answer that is never a lie. */
function getServerSnapshot(): ThemeChoice {
  return 'system';
}

function persist(next: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* Not worth failing the interaction over — the attribute still applies for
       this page's lifetime, it simply will not survive a reload. */
  }
  applyTheme(next);
  // `storage` does not fire in the tab that wrote it, so tell our own
  // subscribers directly. The event still reaches the other tabs.
  for (const listener of listeners) listener();
}

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * A segmented control, not a cycling button.
 *
 * Three states cannot be cycled legibly: a single button that goes
 * light -> dark -> system shows one icon and gives the reader no way to know
 * what the next press does, or which of the three they are currently in. With
 * three segments the current state is visible and any state is one press away.
 *
 * `radiogroup` rather than a `<fieldset>` of inputs because there is no form
 * here and nothing is submitted — this is a control that acts immediately.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-0.5 rounded-sm border border-line p-0.5 ${className}`}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => persist(value)}
            /*
              A real 44x44 box below md, not a `tap-target` overlay. Three of
              these sit 2px apart, and three 44px overlays over three 28px
              boxes would overlap by 16px each — the reader aims at "system"
              and gets "dark", which is worse than the small target was.
              Section 7: grow the box in a group, overlay only in isolation.
            */
            className={`flex size-control-sm items-center justify-center rounded-xs transition-colors duration-[var(--duration-fast)] ease-standard ${
              active
                ? 'bg-accent-subtle text-accent'
                : 'text-ink-muted hover:bg-row-hover hover:text-ink'
            }`}
          >
            <Icon aria-hidden="true" size={14} />
          </button>
        );
      })}
    </div>
  );
}
