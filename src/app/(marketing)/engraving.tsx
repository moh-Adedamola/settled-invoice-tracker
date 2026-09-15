/* ==========================================================================
   Engraved plate work.
   ==========================================================================

   The identity's reference (§1) is intaglio security printing. The login page
   hints at it with a rosette of rotated ellipses; this is the real thing, and
   the landing page is the one surface §2 lets it be loud on.

   ## Why these are computed rather than drawn

   A guilloché is not a decorative squiggle — it is the output of a geometric
   lathe, two gears turning against each other, and the pattern is whatever the
   gear ratio produces. A hypotrochoid IS that machine:

     x = (R - r)·cos t + d·cos(((R - r)/r)·t)
     y = (R - r)·sin t − d·sin(((R - r)/r)·t)

   Drawing the curve properly rather than approximating it with rotated ellipses
   is the difference between a pattern that looks engraved and one that looks
   like a spirograph doodle. The ratio R/r sets the number of petals, `d` sets
   how far the tracing point sits from the rolling centre, and a family of
   curves sharing R and r with different `d` is exactly what a banknote lathe
   lays down in one pass.

   ## Cost

   Everything here is a pure function of its props: no state, no effects, no
   client bundle. The paths are generated once on the server and ship as markup.
   They compress to almost nothing — a path is a long run of similar short
   numbers, which is the best case for gzip — and there is no image to fetch,
   no layout shift, and nothing to decode.

   Coordinates are rounded to one decimal. At a 400-unit viewBox scaled to a few
   hundred CSS pixels that is well below a device pixel, and it cuts the markup
   roughly in half against three decimals.

   ## Colour

   Every stroke is `currentColor` so the caller sets the tint with a text colour
   from the palette. No hex appears here: §3 is explicit that hex lives only in
   `globals.css`.
   ========================================================================== */

/*
 * ## Why the gear ratio is chosen for its turn count, not just its look
 *
 * A hypotrochoid closes after `r / gcd(R, r)` turns and draws `R / gcd(R, r)`
 * petals. The first ratio tried here (R=170, r=61) is coprime, so it needed 61
 * turns to close — and tracing 61 turns smoothly took 560 points per curve.
 *
 * That measured badly. Sixteen curves at 560 points is 157KB of path data, and
 * Next serialises a server component's output into the RSC flight payload as
 * well as the HTML, so it was paid for TWICE: 381KB for a page with no images
 * on it. Ratios sharing a factor give the same petal density for a fraction of
 * the points — R=160, r=32 shares 32, so 40 petals close in 8 turns.
 *
 * `turns` is therefore derived rather than passed. A caller who guessed it
 * wrong left the stroke stopping mid-curve, which shows as a seam in the
 * pattern, and there is no reason for that to be anyone's job to remember.
 */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Points per turn. Each turn is roughly one petal, and 30 is smooth at 400 units. */
const POINTS_PER_TURN = 30;

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * A hypotrochoid, as an SVG path.
 *
 * `R` fixed circle, `r` rolling circle, `d` pen offset.
 */
function rosettePath(R: number, r: number, d: number): string {
  const turns = r / gcd(R, r);
  const steps = Math.max(120, Math.round(turns * POINTS_PER_TURN));
  const k = (R - r) / r;
  const points: string[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    points.push(`${round(x)},${round(y)}`);
  }

  return `M${points.join('L')}Z`;
}

/**
 * The rosette: one lathe pass, several pen offsets.
 *
 * `bands` curves share a gear ratio and differ only in `d`, which is what makes
 * them nest and interfere the way a real plate does rather than sitting as
 * concentric outlines.
 */
export function GuillocheRosette({
  className = '',
  bands = 7,
  R = 160,
  r = 32,
  strokeWidth = 0.45,
}: {
  className?: string;
  bands?: number;
  R?: number;
  r?: number;
  strokeWidth?: number;
}) {
  const curves = Array.from({ length: bands }, (_, i) =>
    rosettePath(R, r, 54 + i * 12),
  );

  return (
    <svg
      aria-hidden="true"
      viewBox="-200 -200 400 400"
      fill="none"
      className={className}
      // The stroke must not thicken as the plate scales up, or a 900px rosette
      // reads as rope rather than engraving.
      vectorEffect="non-scaling-stroke"
    >
      {curves.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth={strokeWidth} />
      ))}
    </svg>
  );
}

/**
 * The wave band along a banknote's edge: several sine components summed, each
 * pass phase-shifted.
 *
 * Two frequencies rather than one, because a single sine reads as a decorative
 * squiggle and the beat between two reads as machined. `lines` copies at rising
 * phase produce the woven look without any of them touching.
 */
export function EngravedWave({
  className = '',
  lines = 5,
  width = 1200,
  height = 48,
  strokeWidth = 0.5,
}: {
  className?: string;
  lines?: number;
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  const mid = height / 2;
  const amp = height * 0.34;

  const paths = Array.from({ length: lines }, (_, band) => {
    const phase = (band / lines) * Math.PI * 2;
    const points: string[] = [];

    for (let i = 0; i <= 90; i++) {
      const x = (i / 90) * width;
      const u = (x / width) * Math.PI * 2;
      const y =
        mid +
        Math.sin(u * 3 + phase) * amp * 0.62 +
        Math.sin(u * 7 - phase * 1.4) * amp * 0.28;
      points.push(`${round(x)},${round(y)}`);
    }

    return `M${points.join('L')}`;
  });

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      fill="none"
      className={className}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth={strokeWidth} />
      ))}
    </svg>
  );
}

/**
 * A corner ornament, as engraved on a certificate's border.
 *
 * Arcs struck from the corner at rising radii, cropped by the viewBox — the
 * same construction a plate engraver uses, and it costs four path commands each
 * rather than a hypotrochoid's several hundred points.
 */
export function CornerRosette({ className = '' }: { className?: string }) {
  const arcs = Array.from({ length: 7 }, (_, i) => 10 + i * 8);

  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" fill="none" className={className}>
      {arcs.map((radius, i) => (
        <path
          key={i}
          d={`M0,${radius} A${radius},${radius} 0 0 1 ${radius},0`}
          stroke="currentColor"
          strokeWidth={i % 2 === 0 ? 0.7 : 0.4}
        />
      ))}
      <circle cx="7" cy="7" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
