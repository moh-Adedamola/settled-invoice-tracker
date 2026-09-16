/**
 * Class strings shared by the filter chips on every list.
 *
 * ## Why this is its own module and not part of `filter-panel.tsx`
 *
 * These lived in `filter-panel.tsx` first, which carries `'use client'`. A
 * value exported from a client module and imported by a **server** component
 * does not arrive as the value: the bundler replaces it with a client
 * reference, and React stringified that reference straight into the class
 * attribute. The rendered markup was
 *
 *     class="function() { throw new Error("Attempted to call FILTER_CHIP()
 *     from the server but FILTER_CHIP is on the client...") } border-line-strong"
 *
 * so every status and provider chip on payments, invoices and clients lost its
 * border, radius and padding at once. Nothing errored — the page rendered, the
 * checkboxes worked, and the only symptom was that the chips went flat.
 *
 * A plain module has no directive, so it is compiled into whichever graph
 * imports it and the string is a string on both sides.
 *
 * Verified by computed style rather than by eye: `borderTopWidth` was `0px`
 * before and `1px` after.
 */

/**
 * The chip itself — a checkbox whose LABEL is the target.
 *
 * §7: the mark is `size-mark` (16px) and the hit area comes from the label at
 * `min-h-control`. These measured 12×12 before, the smallest interactive thing
 * in the product.
 *
 * `min-h` rather than `h` so a chip whose label wraps grows instead of
 * clipping; `md:min-h-0` returns the row to its natural height at pointer
 * widths, where 44px of padding around a chip is dead space.
 */
export const FILTER_CHIP =
  'inline-flex min-h-control cursor-pointer items-center gap-1.5 rounded-xs border px-2 py-1 text-micro uppercase transition-colors duration-[var(--duration-fast)] ease-standard md:min-h-0';

/**
 * A checkbox or radio's visual mark. 16px — the conventional size, and the
 * smallest that reads as a box rather than a speck. It is NOT the hit area:
 * that comes from a `<label>` at `min-h-control` wrapping it (§7). Used by the
 * filter chips and by the settings forms, which is why the name is not
 * filter-specific.
 */
export const CHECKBOX_MARK = 'size-mark shrink-0 accent-[var(--accent)]';
