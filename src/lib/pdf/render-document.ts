import 'server-only';

import { Font, renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/types';
import type { ReactElement } from 'react';

/* ==========================================================================
   Rendering more than one PDF in a process

   Every PDF after the first in a single process used to ship a corrupted
   ToUnicode table: `Harbor & Finch Consulting` decoded as
   `rbr & Finch Cnsulting`. The page LOOKED perfect — the corruption is only in
   the text layer, so it surfaces when a client selects and copies, when a mail
   client indexes the attachment, or when an accounts system parses it.

   That shape is exactly what `dispatch-outbound` does: one attachment per
   queued email, all in one invocation.

   ## The cause

   Three facts compose into the bug:

   1. `@react-pdf/font` memoises `loadResultPromise`, so the fontkit font object
      for each face is created ONCE and shared by every document in the process.

   2. fontkit's glyph cache is keyed by glyph id ALONE:

          getGlyph(glyph, characters = []) {
            if (!this._glyphs[glyph]) this._glyphs[glyph] = new Glyph(glyph, characters, this);
            return this._glyphs[glyph];
          }

      The `characters` argument — the code points the glyph stands for — is
      honoured only when the entry is created. Every later call silently
      discards it and returns whatever was cached first.

   3. pdfkit builds the ToUnicode CMap straight off that field:
      `this.unicode[gid] = glyph.codePoints`.

   The trigger is composite glyphs. Resolving `á` for the glyf subset runs
   `_getContours()`, which walks its components with
   `this._font.getGlyph(component.glyphID)` — NO code points. So the base `a`
   gets cached with `codePoints: []`.

   Measured on IBM Plex Sans 500: gid 4 cached `[]`, later asked for `[97]`
   ('a'); gid 21 cached `[]`, later asked for `[111]` ('o'). Both were then
   written into the CMap as empty entries, and those letters decoded to nothing.

   The first document escapes on timing alone: its `unicode[]` is filled during
   layout, and the composite walk that poisons the cache happens afterwards, at
   subset time. So document 1 is always clean and every later one is not —
   which is precisely the behaviour that made this hard to pin down.

   ## The fix

   Drop fontkit's glyph cache before each render, so every document starts from
   the same state a fresh process would give it.

   `_glyphs` is a pure memo — a Glyph is reconstructible from its id, and
   nothing holds one across documents (pdfkit's own `layoutCache` is built per
   `EmbeddedFont`, so per document). Clearing it re-decodes glyphs the next
   document asks for, which measured as no cost at all: ten real invoices ran
   278ms each with the reset against 314ms without it, so the difference is
   run-to-run noise either way.

   Deliberately NOT done instead:
     - `Font.clear()` / `Font.reset()` — both crash yoga mid-layout, and they
       re-read the font files, which this does not need.
     - Patching `getGlyph` to backfill empty code points — narrower. It fixes
       the empty case only, and leaves a gid legitimately reached with two
       different code-point sets still resolving to whichever came first.
     - A worker process per render — correct but wrong shape for a serverless
       function that may drain a queue of ten.

   `scripts/check-pdf-text.tsx` renders ten documents in one process and
   round-trips all ten; that case exists to hold this down.
   ========================================================================== */

/** The shape of a fontkit font, of which only the glyph memo concerns us. */
type FontkitFont = { _glyphs?: Record<number, unknown> };
type FontSource = { data?: FontkitFont | null };

/**
 * Clears the glyph memo on every registered face.
 *
 * Silent about faces that expose no `_glyphs` — the fourteen standard PDF
 * fonts are `StandardFont` wrappers with no fontkit object behind them, and a
 * face that was registered but never loaded has no `data` yet.
 */
function resetGlyphCaches(): void {
  const families = Font.getRegisteredFonts() as unknown as Record<
    string,
    { sources?: FontSource[] } | undefined
  >;

  for (const family of Object.values(families ?? {})) {
    for (const source of family?.sources ?? []) {
      const font = source.data;
      if (font && font._glyphs) font._glyphs = {};
    }
  }
}

/**
 * Renders a document to a buffer.
 *
 * The single way this codebase turns a PDF element into bytes. Call this rather
 * than `renderToBuffer` directly, so no caller can miss the reset above.
 */
export async function renderDocumentToBuffer(
  document: ReactElement<DocumentProps>,
): Promise<Buffer> {
  resetGlyphCaches();
  return renderToBuffer(document);
}
