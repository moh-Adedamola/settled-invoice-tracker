/**
 * Theme preference: the one place the three states and the storage key are
 * named.
 *
 * Imported by both the blocking head script (which is inlined as a string, so
 * it cannot import — see `THEME_INIT_SCRIPT`) and the React toggle. Keeping the
 * key in one module means the two cannot drift apart and leave a preference
 * that is written but never read.
 */

export const THEME_STORAGE_KEY = 'settled:theme';

/**
 * Three states, and the third is not a colour.
 *
 * `system` means "no opinion" and is stored as an ABSENCE of the attribute, not
 * as a resolved value. That is what makes the `prefers-color-scheme` block in
 * `globals.css` live: resolving system to `light` or `dark` in JavaScript and
 * stamping that would mean a reader who changes their OS theme at 6pm keeps
 * whatever we decided at 9am until they reload.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Applies a choice to the document.
 *
 * `system` REMOVES the attribute rather than setting it to anything. Both CSS
 * rules that implement a theme are written to lose to an explicit
 * `[data-theme]`, so the absence is load-bearing.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

/**
 * The blocking script, as a string, for the document head.
 *
 * ## Why this is inline and synchronous
 *
 * A stored preference that is applied by React runs after hydration, which is
 * after first paint. The reader sees the default theme, then a flash to theirs,
 * on every single page load. That flash is worse than having no toggle at all:
 * the toggle is a convenience, the flash is a defect on every navigation.
 *
 * So this runs in the head, before the body exists, and sets the attribute
 * synchronously. It is the one place a render-blocking script is the right
 * answer, and it is kept to the minimum that buys that: read, validate, stamp.
 *
 * ## Why it is wrapped in try/catch
 *
 * `localStorage` throws rather than returning null in a handful of real
 * configurations — Safari private browsing historically, and any browser set to
 * block site data. An exception here happens before the body renders, so it
 * would leave a blank page rather than an unstyled one. The catch costs nothing
 * and the failure mode it prevents is total.
 *
 * Nothing is stamped for an invalid or missing value: no attribute means the
 * base (light) and the media query apply, which is exactly the "system"
 * behaviour a first-time visitor should get.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
