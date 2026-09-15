/**
 * The rasterised-asset palette must agree with §3.
 *
 *   npm run test-brand-raster
 *
 * `lib/brand-raster.ts` holds hex because Satori cannot resolve custom
 * properties (see that file). The cost of that exception is a second copy, and
 * the copy is only safe if something notices when it drifts. This is that
 * something: it reads the tokens out of `globals.css` and compares.
 *
 * The failure it prevents is quiet. A palette change would leave the favicon and
 * the Open Graph card on the old copper, and neither is somewhere anyone looks —
 * one is 16 pixels wide, the other appears inside someone else's chat window.
 */
import { readFileSync } from 'node:fs';

import { COPPER, INK, INK_RAISED, MUTED, PAPER } from '../src/lib/brand-raster';

const css = readFileSync('src/app/globals.css', 'utf8');

/** The dark block: these assets are drawn on ink whatever the reader's theme. */
const dark = (() => {
  const i = css.indexOf('[data-theme="dark"] {\n  color-scheme: dark;');
  if (i === -1) throw new Error('dark theme block not found in globals.css');
  let depth = 0;
  let j = css.indexOf('{', i);
  const open = j;
  for (;;) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}') {
      depth--;
      if (!depth) break;
    }
    j++;
  }
  return css.slice(open + 1, j);
})();

const tokenValue = (name: string): string => {
  // A character class rather than `\s`: this file is written through tooling
  // that has eaten the escape more than once, and `[ \t]` cannot be misread.
  const m = new RegExp(`${name}:[ \t]*(#[0-9a-fA-F]{6})[ \t]*;`).exec(dark);
  if (!m) throw new Error(`${name} not found in the dark theme block`);
  return m[1]!.toLowerCase();
};

const CASES: [string, string, string][] = [
  ['INK', INK, '--bg-base'],
  ['INK_RAISED', INK_RAISED, '--bg-raised'],
  ['COPPER', COPPER, '--accent'],
  ['PAPER', PAPER, '--fg-primary'],
  ['MUTED', MUTED, '--fg-muted'],
];

let fail = 0;
for (const [name, value, token] of CASES) {
  const want = tokenValue(token);
  const ok = value.toLowerCase() === want;
  if (!ok) fail++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(11)} ${value}  ${token.padEnd(13)} ${want}`,
  );
}

console.log(`\n  ${CASES.length - fail} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
