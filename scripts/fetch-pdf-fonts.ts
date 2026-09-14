/**
 * Vendors the COMPLETE IBM Plex TTFs the invoice PDF renders with.
 *
 *   npx tsx scripts/fetch-pdf-fonts.ts
 *
 * Complete, not Google's webfont subset. The Google Fonts v1 CSS API serves a
 * ~270-glyph latin cut, which is missing the naira sign this ledger's base
 * currency is written in, and every status marker the badges print. A PDF built
 * on it renders those as nothing at all.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'src', 'lib', 'pdf', 'fonts');
const BASE = 'https://cdn.jsdelivr.net/gh/IBM/plex@v6.4.0';

const WANTED: Array<{ dir: string; file: string; out: string }> = [
  { dir: 'IBM-Plex-Sans', file: 'IBMPlexSans-Regular.ttf', out: 'IBMPlexSans-400.ttf' },
  { dir: 'IBM-Plex-Sans', file: 'IBMPlexSans-Medium.ttf', out: 'IBMPlexSans-500.ttf' },
  { dir: 'IBM-Plex-Sans', file: 'IBMPlexSans-SemiBold.ttf', out: 'IBMPlexSans-600.ttf' },
  { dir: 'IBM-Plex-Mono', file: 'IBMPlexMono-Regular.ttf', out: 'IBMPlexMono-400.ttf' },
  { dir: 'IBM-Plex-Mono', file: 'IBMPlexMono-Medium.ttf', out: 'IBMPlexMono-500.ttf' },
];

function looksLikeAFont(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  const hex = buf.subarray(0, 4).toString('hex');
  if (hex === '00010000') return 'TrueType';
  if (buf.subarray(0, 4).toString('latin1') === 'OTTO') return 'CFF/OpenType';
  return null;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  for (const want of WANTED) {
    const url = `${BASE}/${want.dir}/fonts/complete/ttf/${want.file}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${want.file}: HTTP ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    const kind = looksLikeAFont(buf);
    if (!kind) {
      throw new Error(
        `${want.file}: ${buf.length} bytes that are not a font ` +
          `(starts ${buf.subarray(0, 8).toString('hex')}). Refusing to write it.`,
      );
    }
    // The subset was ~56KB; a complete cut is ~200KB. A small file here means
    // the CDN served a subset again.
    if (buf.length < 120_000) {
      throw new Error(`${want.file}: only ${buf.length} bytes — that is a subset, not the complete font.`);
    }

    writeFileSync(join(OUT, want.out), buf);
    console.log(`  ${want.out.padEnd(22)} ${buf.length.toLocaleString().padStart(9)} bytes  ${kind}`);
  }

  writeFileSync(
    join(OUT, 'README.md'),
    [
      '# Vendored fonts',
      '',
      'IBM Plex Sans and IBM Plex Mono, complete TTFs from',
      '`github.com/IBM/plex` at `v6.4.0`, under the SIL Open Font License 1.1.',
      '',
      'Vendored rather than fetched at render time so a CDN failure cannot become',
      'a silent fallback to Helvetica, and **complete** rather than a webfont',
      'subset: the Google Fonts latin cut is missing U+20A6 (naira), U+25CF,',
      'U+25D0, U+25B2, U+25CB (status markers) and U+2248 (the approx mark).',
      '',
      'Regenerate with `scripts/tmp-fetch-fonts.ts`.',
      '',
    ].join('\n'),
  );
  console.log('  README.md written');
}

main().then(() => process.exit(0));
