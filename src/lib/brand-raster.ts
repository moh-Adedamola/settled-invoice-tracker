/* ==========================================================================
   Palette values for RASTERISED brand assets.
   ==========================================================================

   DO NOT REPLACE THESE WITH TOKENS. THEY WILL NOT RESOLVE.

   §3 says hex lives only in `globals.css`, and this module is the single
   deliberate exception in the codebase. It is not an oversight anyone needs to
   tidy up, and the tidy-up does not work:

   `next/og` renders through Satori, which implements a subset of CSS against a
   detached element tree with no document, no cascade and no stylesheet. There
   is nothing for a custom property to inherit FROM. `color: var(--accent)`
   does not fall back to the token's value and does not throw — it resolves to
   nothing, and the element is drawn in the initial colour. On an ink ground
   that is near-black on near-black: an asset that looks blank, in a preview
   nobody opens until it is already being shared.

   The same applies to a Tailwind class, which is why every file importing this
   is written in inline styles throughout: there is no stylesheet for a class to
   match.

   It lives in one module rather than beside each asset so that a palette change
   has exactly two places to touch — `globals.css` and here — instead of one per
   generated image. `scripts/test-brand-raster.ts` asserts these still agree
   with §3, so drift fails a check rather than shipping.

   If §3's values change, change them here too.
   ========================================================================== */

/** `--bg-base` — printing ink. */
export const INK = '#0e1319';
/** `--bg-raised` — the lifted surface, for a gradient's light end. */
export const INK_RAISED = '#161c24';
/** `--accent` (dark theme) — copper, the plate the marks are cut into. */
export const COPPER = '#d7935e';
/** `--fg-primary` — paper. */
export const PAPER = '#ebeff4';
/** `--fg-muted` — quiet text. */
export const MUTED = '#8a939c';
