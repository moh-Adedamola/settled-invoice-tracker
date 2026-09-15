import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { COPPER, INK } from '@/lib/brand-raster';

/* ==========================================================================
   The favicon.
   ==========================================================================

   Generated, like the OG card, rather than committed as a binary. An .ico in
   the repo is a second copy of the identity that drifts the first time a token
   changes, and nobody notices because the only place it appears is 16 pixels
   wide in a tab strip.

   ## Designed at 16px, not scaled down to it

   The wordmark is Newsreader, and a Newsreader S is the wrong answer here. It
   is a high-contrast text serif: at 16px its thin strokes fall below one device
   pixel and either vanish or alias into grey mush, and its bracketed serifs
   close up into blobs. That is the failure you get by designing at 512 and
   trusting the downscale.

   The mark used instead is the one this app already has at small size: the
   collapsed sidebar rail shows a bare `S`, set in Plex Sans rather than the
   display face, and it has been legible at 60px since the shell was built. Plex
   is an engineering typeface with flat terminals and open counters — drawn for
   exactly this. So the favicon is that same S, at the same weight.

   ## Copper ground, ink letter — not the reverse

   Knocked out of a filled plate rather than drawn on a dark one. Two reasons,
   both about 16px:

     - A tab strip is a crowd. A solid copper block is identifiable as a SHAPE
       before any letter is read, which is what actually finds the tab; an ink
       square would disappear into a dark browser theme and into the ink grounds
       of every other dark-mode favicon.
     - It keeps the contrast fixed. §3's copper and ink were measured against
       each other (7.31:1), and neither depends on what the browser paints
       behind the icon — which we do not control and which differs per theme.

   No rounded corners. At 16px a radius costs the two or three pixels that carry
   the letter's shoulders, and every browser that wants a rounded icon applies
   its own mask anyway.

   ## Sizes

   `generateImageMetadata` emits the set browsers actually ask for. Each is
   RENDERED at its own size rather than one image being resampled, so the glyph
   is rasterised against the pixel grid it will be shown on.
   ========================================================================== */

export const contentType = 'image/png';

export function generateImageMetadata() {
  return [16, 32, 48, 96, 192, 512].map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: 'image/png',
  }));
}

/**
 * `id` is a PROMISE, not a string.
 *
 * Next 16 made the image-route props async the same way it made `params`
 * async, and the failure is silent rather than loud: `Number(promise)` is NaN,
 * which reaches Satori as `fontSize: NaN` and surfaces as a 500 from a CSS
 * parser, several layers from the cause. Measured by serialising the props —
 * they arrive as `{ params: {}, id: {} }`, two promises.
 */
export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);

  const font = await readFile(
    join(process.cwd(), 'src', 'lib', 'pdf', 'fonts', 'IBMPlexSans-600.ttf'),
  );

  /*
   * The ratio is size-dependent, because 16px is not a scaled-down 32px.
   *
   * At 32px and above, 0.78 leaves a comfortable plate margin. At 16px the same
   * ratio put the S's curves across the last pixel on each side, and the
   * anti-aliasing smeared the strokes into the copper — legible, but muddy.
   * 0.70 pulls it in by one pixel each side and the stem lands cleaner.
   */
  const fontSize = Math.round(size * (size <= 16 ? 0.7 : 0.78));

  /*
   * The optical nudge is skipped entirely at 16px. `round(16 * 0.04)` is 1px,
   * which is 6% of the box — at that size it stops being an optical correction
   * and becomes a visible shift off centre.
   */
  const nudge = size <= 16 ? 0 : Math.round(size * 0.04);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COPPER,
          color: INK,
          fontFamily: 'Plex',
          fontSize,
          fontWeight: 600,
          // The cap sits slightly high in the em box; nudge it back onto the
          // optical centre. One pixel at 16px, and it is visible at 16px.
          lineHeight: 1,
          paddingBottom: nudge,
        }}
      >
        S
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [{ name: 'Plex', data: font, weight: 600, style: 'normal' }],
    },
  );
}
