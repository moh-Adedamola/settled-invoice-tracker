import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { COPPER, INK } from '@/lib/brand-raster';

/**
 * The home-screen icon.
 *
 * 180×180 is the size iOS asks for. Differences from `icon.tsx`, both forced by
 * where this one is shown:
 *
 *   - FULL BLEED, no padding of its own and no rounding. iOS applies its own
 *     corner mask and will clip whatever is underneath, so a radius here would
 *     be masked twice and a margin would leave a copper ring inside the squircle.
 *   - A slightly smaller glyph ratio, because the mask crops the corners and a
 *     letter sized for a square starts to crowd them.
 *
 * No transparency: an alpha channel here composites against whatever wallpaper
 * the reader has, which is the one background we cannot measure contrast for.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  const font = await readFile(
    join(process.cwd(), 'src', 'lib', 'pdf', 'fonts', 'IBMPlexSans-600.ttf'),
  );

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
          fontSize: 118,
          fontWeight: 600,
          lineHeight: 1,
          paddingBottom: 6,
        }}
      >
        S
      </div>
    ),
    { ...size, fonts: [{ name: 'Plex', data: font, weight: 600, style: 'normal' }] },
  );
}
