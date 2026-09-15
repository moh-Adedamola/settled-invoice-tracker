import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { COPPER, INK, INK_RAISED, MUTED, PAPER } from '@/lib/brand-raster';

/* ==========================================================================
   The Open Graph card.
   ==========================================================================

   Generated rather than committed as a PNG. A binary in `public/` is a second
   copy of the identity that drifts the first time a token changes and that
   nobody notices, because the only place it appears is inside someone else's
   chat window. This is drawn from the same palette values as the page.

   ## Fonts

   IBM Plex Sans is read off disk from the copies already vendored for the
   invoice PDF, so the build makes no network request. Newsreader is NOT used
   here despite being the display face: it is loaded through `next/font` and has
   no vendored file, and fetching a font at build time to render a social card
   is a failure mode waiting for the first offline build. Plex at 600 is the
   product's own UI voice, which is a defensible second choice — noted in the
   report rather than hidden.

   ## Layers

   Hand-built rather than reusing `engraving.tsx`: Satori implements a subset of
   CSS and does not render SVG `<path>` elements, so the guilloché components
   would come out blank. The card gets the palette, the type and the copper
   rule, which is what survives at 1200x630 in a feed anyway.
   ========================================================================== */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt =
  'Settled — every payment matched, every late invoice chased.';

/*
 * Palette from `lib/brand-raster`, which is the single place rasterised assets
 * are allowed to hold hex — Satori resolves no custom properties, so a
 * `var(--accent)` here renders as nothing. The full explanation is in that file.
 */      /* --fg-muted   */

export default async function Image() {
  const fontDir = join(process.cwd(), 'src', 'lib', 'pdf', 'fonts');
  const [regular, semibold] = await Promise.all([
    readFile(join(fontDir, 'IBMPlexSans-400.ttf')),
    readFile(join(fontDir, 'IBMPlexSans-600.ttf')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: `linear-gradient(135deg, ${INK_RAISED} 0%, ${INK} 55%)`,
          fontFamily: 'Plex',
        }}
      >
        {/* Struck copper rule, the way a plate's edge reads. */}
        <div style={{ display: 'flex', width: '100%', height: 4, background: COPPER }} />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 6,
              textTransform: 'uppercase',
              color: COPPER,
              fontWeight: 600,
            }}
          >
            Settled
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 76,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: PAPER,
              fontWeight: 600,
              maxWidth: 900,
            }}
          >
            Every payment matched. Every late invoice chased.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 27,
              lineHeight: 1.45,
              color: MUTED,
              maxWidth: 820,
            }}
          >
            Invoicing and reconciliation across Stripe, Paystack and Flutterwave.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 22,
            color: MUTED,
          }}
        >
          <span>₦</span>
          <span style={{ color: COPPER }}>·</span>
          <span>$</span>
          <span style={{ color: COPPER }}>·</span>
          <span>£</span>
          <span style={{ color: COPPER }}>·</span>
          <span>€</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Plex', data: regular, weight: 400, style: 'normal' },
        { name: 'Plex', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  );
}
