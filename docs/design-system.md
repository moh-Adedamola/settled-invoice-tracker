# Settled — Design System

Invoice and payment tracking across Stripe, Paystack and Flutterwave. Single business,
Lagos-based, local and international clients.

Tokens live in [`src/app/globals.css`](../src/app/globals.css). Every value in this
document was measured, not estimated — see [Measurement method](#measurement-method).

---

## 1. Reference and identity

**The reference is intaglio security printing** — the engraved plate work used on
banknotes and share certificates — **crossed with the ruled ledger book.**

Why this and not something safer:

- It is what the product literally is. Settled handles money in four currencies across
  three processors. Security printing is the visual language money already speaks:
  fine rules, engraved figures, tinted grounds, restraint bordering on austerity. A
  reference drawn from the subject matter cannot read as decoration applied afterwards.
- **Copper comes from the printing plate, not from a mood board.** Intaglio plates are
  copper; the accent is the tool that makes the marks. It also sits far from every
  status hue, which matters when seven states must stay separable (§3).
- The ledger book supplies the structural grammar: hairline rules between entries, a
  double rule under a total, figures in a fixed-width column. Those are the app's two
  signatures (§5), and they cost nothing at runtime — no gradient, no image, no motion.
- **The local anchor is Nigerian banknote printing** (NSPMC intaglio), which is where a
  Lagos agency's clients meet engraved copper-plate work daily. It is deliberately not
  the Benin Bronzes or adire textile: those are contested or ceremonial artefacts, and
  flattening them into a SaaS accent would be glib. Currency printing is the honest
  local reference for money software.

**Ground is ink, accent is copper.** The dark base `#0e1319` is a blue-black mixed like
printing ink rather than a neutral grey — it has a measurable cool cast (OKLCH hue 252)
that makes warm copper read as metal rather than orange. Light theme is `#f9f8f5`,
ledger paper, never white.

What this rejects: no Inter, Roboto, Open Sans, Lato, Poppins, Montserrat, Space Grotesk,
no system stack, no purple gradient. Nothing in the palette is a default.

---

## 2. Ambition by surface — the governing constraint

This split is binding on every later phase. When a later decision conflicts with the
rest of this document, **this section wins.**

| Surface | Ambition | What that permits | What it forbids |
| --- | --- | --- | --- |
| **Landing page** | Full | Layered grounds, guilloché line work, staggered entrance, display type at 3.5rem+, parallax, expressive `--duration-expressive` | Nothing, within `prefers-reduced-motion` |
| **Login, empty states, error pages** | Moderate | One display line, one considered flourish (a 4%-opacity engraved plate behind the card), a single fade-in | Choreography, multi-step reveals, decorative motion on repeat visits |
| **Dashboard, tables, forms, ledger, queue, settings** | Restrained by intent | Typography, colour temperature, border and spacing detail, the two signatures in §5 | Gradients behind data, entrance animation, decorative illustration, atmospheric backgrounds, anything that replays on every visit |

The application is opened dozens of times a week by someone checking whether they got
paid. Character there comes from figures that align, rules that mean something, and a
palette that stays out of the way. **Backgrounds under tabular data stay flat.**
Legibility beats atmosphere every time.

The test for any app-surface flourish: *would this still be welcome on the four
hundredth viewing?* If not, it belongs on the landing page.

---

## 3. Colour

### 3.1 Semantic core

Dark is default. Light is opt-in via `[data-theme="light"]`, falling back to the OS
preference when the user has not chosen.

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg-base` | `#0e1319` | `#f9f8f5` | Page ground |
| `--bg-inset` | `#0b1015` | `#f0efeb` | Wells: table body, input interior, code |
| `--bg-raised` | `#161c24` | `#fdfdfb` | Cards, sidebar, sticky header |
| `--bg-overlay` | `#1d242e` | `#ffffff` | Modal, popover, dropdown |
| `--fg-primary` | `#ebeff4` | `#192029` | Headings, KPI figures, large text |
| `--fg-body` | `#d3dbe3` | `#192029` | **Table cells and running text at 13–14px** |
| `--fg-secondary` | `#aab2ba` | `#4c535d` | Descriptions, secondary labels |
| `--fg-muted` | `#8a939c` | `#6b727a` | Column headers, timestamps, placeholder |
| `--line-subtle` | `#2f3843` | `#d9d6cf` | Row rules, decorative dividers |
| `--line-default` | `#30363d` | `#d3d1cb` | Card and container edges |
| `--line-strong` | `#6d757f` | `#8d8a83` | **Control boundaries — required on inputs** |
| `--accent` | `#d7935e` | `#9a541b` | Primary action, focus ring, active nav |
| `--accent-hover` | `#e8a675` | `#87470f` | |
| `--accent-active` | `#c4824f` | `#77400c` | |
| `--accent-subtle` | `#33220f` | `#faeede` | Selected row, active nav ground |
| `--row-hover` | `#243040` | `#eae8e2` | Table row hover — **not** `bg-raised` |
| `--accent-fg` | `#0e1319` | `#fdfdfb` | Text on a copper fill |

Note `--accent-fg` inverts between themes: dark-theme copper is light enough to take ink
text (7.31:1), light-theme copper is dark enough to take paper text (5.64:1). Never
hardcode the button label colour — use the token.

**Measured core contrast**

| Pair | Dark | Light | Minimum |
| --- | --- | --- | --- |
| fg-primary / bg-base | 16.15:1 | 15.45:1 | 4.5 |
| **fg-body / bg-base** | **13.33:1** | 15.45:1 | 4.5 |
| fg-primary / bg-raised | 14.84:1 | 16.11:1 | 4.5 |
| fg-secondary / bg-base | 8.69:1 | 7.32:1 | 4.5 |
| fg-muted / bg-base | 5.98:1 | 4.58:1 | 4.5 |
| fg-muted / bg-raised | 5.49:1 | 4.78:1 | 4.5 |
| **fg-muted / bg-overlay** | **5.01:1** | **4.87:1** | 4.5 |
| accent / bg-base | 7.31:1 | 5.41:1 | 4.5 |
| accent / bg-raised | 6.71:1 | 5.64:1 | 4.5 |
| accent-fg / accent (button) | 7.31:1 | 5.64:1 | 4.5 |
| accent-hover / bg-base | 9.01:1 | 6.73:1 | 4.5 |
| **line-strong / bg-base** | **4.00:1** | **3.24:1** | 3.0 (WCAG 1.4.11) |
| **line-strong / bg-raised** | **3.67:1** | **3.38:1** | 3.0 (WCAG 1.4.11) |
| **line-strong / bg-overlay** | **3.35:1** | **3.45:1** | 3.0 (WCAG 1.4.11) |
| accent as focus ring / bg-base | 7.31:1 | 5.41:1 | 3.0 |

`--line-subtle` and `--line-default` are decorative and deliberately below 3:1 — they
divide, they do not bound a control. **Any input, select, checkbox or bounded control
must use `--line-strong`**, which is the only border token that clears 1.4.11.

**Both dark values were corrected after the login build.** They had only ever been
measured against `bg-base`, and a form does not live on the page ground — it lives in a
card or a modal. `--line-strong` at `#5f6771` gave 2.99:1 on `bg-raised` and 2.73:1 on
`bg-overlay`, and `--fg-muted` at `#7d868f` gave 4.23:1 as placeholder text on an overlay.
Both now clear their thresholds on **every** container a control can sit in, which is what
the table above records. When adding a surface token, re-measure these two against it.

### 3.2 Status

Eight states, each with foreground, subtle background and border.

**Schema enums map onto these presentation states.** The database carries ten
values across two enums; this table is the only place the mapping is defined,
and it is implemented once in `src/components/ui/status-badge.tsx`.

| Schema value | Enum | Presentation state | Label shown |
| --- | --- | --- | --- |
| `draft` | invoice | `draft` | Draft |
| `sent` | invoice | `pending` | Sent |
| `partial` | invoice | **`partial`** | Partial |
| `paid` | invoice | `paid` | Paid |
| `overdue` | invoice | `overdue` | Overdue |
| `void` | invoice | `void` | Void |
| `succeeded` | payment | `paid` | Succeeded |
| `pending` | payment | `pending` | Pending |
| `failed` | payment | `failed` | Failed |
| `refunded` | payment | `refunded` | Refunded |

Two values fold into an existing state because they are synonyms of it, not
distinct facts: an invoice that is `sent` and a payment that is `pending` are
both money in flight, and `succeeded` is what `paid` means on a payment. The
label keeps the schema's own word, so a badge never misreports the record it
came from.

**`partial` is not one of those.** It gained its own token because money has
actually arrived, which is a different fact from an invoice merely being
outstanding, and the two lead to different collection decisions: you chase a
`sent` invoice and you reconcile a `partial` one. Folding it into `pending`
made the badge lie about the balance.

**Dark**

| Status | fg | subtle bg | border | fg on subtle | fg on base |
| --- | --- | --- | --- | --- | --- |
| paid | `#87e8c4` | `#0d2a20` | `#2f6353` | **10.50:1** | 12.76:1 |
| pending | `#5699cf` | `#102638` | `#2e5f84` | **5.05:1** | 6.09:1 |
| partial | `#9d8c19` | `#2a2400` | `#51480f` | **4.59:1** | 5.51:1 |
| overdue | `#fed261` | `#2f2200` | `#7a5c14` | **10.82:1** | 12.97:1 |
| failed | `#fd9195` | `#3a181a` | `#8a4046` | **7.29:1** | 8.58:1 |
| refunded | `#ddc1ff` | `#2a1d38` | `#6b4d94` | **9.87:1** | 11.68:1 |
| draft | `#95b2d1` | `#1d2530` | `#44546a` | **7.04:1** | 8.50:1 |
| void | `#818b96` | `#1b1f24` | `#3c444d` | **4.78:1** | 5.39:1 |

**Light**

| Status | fg | subtle bg | border | fg on subtle | fg on base |
| --- | --- | --- | --- | --- | --- |
| paid | `#07553f` | `#dcf6ec` | `#8dc9b4` | **7.75:1** | 8.31:1 |
| pending | `#0f69a4` | `#dcf0fb` | `#93c2e0` | **5.00:1** | 5.53:1 |
| partial | `#2f2903` | `#f4f1de` | `#d6d2ba` | **12.84:1** | 13.74:1 |
| overdue | `#846500` | `#fbefd0` | `#d3b675` | **4.78:1** | 5.15:1 |
| failed | `#9a0a2c` | `#fde7ea` | `#e2949f` | **7.25:1** | 8.06:1 |
| refunded | `#622c91` | `#f2e9fb` | `#bfa0da` | **7.79:1** | 8.64:1 |
| draft | `#3e5873` | `#e9eef4` | `#a8b6c6` | **6.32:1** | 6.94:1 |
| void | `#646d77` | `#eef0f2` | `#bcc1c6` | **4.60:1** | 4.95:1 |

Every pair clears AA in both themes. The tightest is light `void` at 4.60:1.

### 3.3 Colour-vision deficiency

Statuses are separated on **three** axes — hue, lightness and chroma — never hue alone.
Minimum pairwise distance in OKLab (ΔE ×100; JND ≈ 2):

Measured across all **eight** states:

| | Dark | Light |
| --- | --- | --- |
| Normal | 9.1 (pending/void) | 8.5 (pending/draft) |
| Deuteranopia | **8.5** (pending/void) | **7.6** (paid/failed) |
| Protanopia | **8.4** (refunded/draft) | **7.7** (draft/void) |

**Adding `partial` cost nothing.** The eighth state was solved for rather than
chosen: a hue sweep over both themes, maximising the worst-case separation
against the seven locked foregrounds subject to AA on its own badge ground and
on the page ground. The olive band (OKLCH hue 100-112) is the only family
outside the red and amber ones where both themes keep their existing floor
exactly — `partial` is never the binding pair in either. The red-orange family
scored equally but sits beside `failed`, which is semantically wrong for a state
that means progress.

The palette is now close to saturated. Adding a *ninth* status will lower a
floor; when that day comes, prefer a non-colour distinction over a new hue.

**Deviation, stated plainly: my working bar was ΔE ≥ 8 and the light theme lands at 7.6.**
It is ~3.8× JND and comfortably distinguishable, but it is under my own target and I am
not going to round it up. The cause is structural rather than a bad colour choice: in a
light theme every foreground must be dark enough for 4.5:1 against near-white paper,
which compresses all seven states into roughly 0.24 of OKLab lightness. Under
dichromacy the surviving axes are lightness and blue↔yellow, and green (`paid`) and red
(`failed`) both collapse toward the same dark warm neutral. I ran four full solves
trying to beat it — including moving `paid` to cyan and forcing both neutrals
achromatic — and every attempt that improved this pair broke a different one or
inverted the semantic ordering (`void` reading brighter than `draft`). 7.6 with correct
semantics is the better trade than 8.4 with `draft` darker than the active states.

**This is why the non-colour cue below is mandatory, not a nicety.** WCAG 1.4.1 requires
it regardless; here it is also what carries the residual 7.6.

#### HARD RULE — a badge without its marker is a bug

This is not a recommendation and not an accessibility nicety to be added later. It is
load-bearing: §3.5 measures the badge as it is actually built, and the colour alone does
not carry the distinction. **A status badge that renders without its marker glyph is a
defect, at the same severity as a wrong amount.** Code review rejects it. There is no
"just this one place" — the compact table variant, the toast, the CSV export legend and
the mobile card all render the marker.

The marker is a property of the status, not of the component. Derive both from one map so
a new consumer cannot obtain a colour without also obtaining its glyph:

```ts
const STATUS = {
  paid:     { marker: '●', label: 'Paid' },
  pending:  { marker: '◐', label: 'Pending' },
  overdue:  { marker: '▲', label: 'Overdue' },
  failed:   { marker: '✕', label: 'Failed' },
  refunded: { marker: '↺', label: 'Refunded' },
  draft:    { marker: '○', label: 'Draft' },
  void:     { marker: '—', label: 'Void' },
} as const;
```

| Status | Marker | Rationale |
| --- | --- | --- |
| paid | `●` filled circle | Settled, closed |
| pending | `◐` half circle | In flight |
| partial | `½` | Part paid — the only numeric marker, and unmistakable at 10px where a
half-filled shape would not be |
| overdue | `▲` filled triangle | Needs action — the only triangle |
| failed | `✕` cross | Terminal failure |
| refunded | `↺` reverse arrow | Money went back |
| draft | `○` hollow circle | Not issued |
| void | `—` dash, **plus strikethrough on the label** | Cancelled; the only struck text |

### 3.4 Badge construction — measured at size, not as a swatch

The §3.2/3.3 figures measure the status **foreground**. A badge at `radius-xs` with 11px
type is roughly 10% text ink, 14% border and 76% ground — so what the eye receives when
scanning a column is a composite dominated by the ground, not the foreground.

Measured, dark theme, `paid` vs `overdue`:

| Signal | Dark | Light |
| --- | --- | --- |
| Foreground swatch | 16.1 | 17.3 |
| Whole badge at 11px | 4.7 | 2.8 |
| Whole badge, scanned in a column | 3.0 | 1.7 |
| Whole badge under deuteranopia | 4.0 | 2.5 |

Worst pair across all seven **as whole badges** was **2.0** (dark) and **0.3** (light) —
at or below JND. The cause was mine: every badge ground was set to the same lightness
(dark L 0.26, light L 0.955) for visual tidiness, so the dominant 76% of the stamp
carried no signal. `paid` and `overdue` grounds differ by a luminance ratio of **1.02:1**.

Re-solving the grounds fixed dark (2.0 → 3.5) but proved **infeasible for light**: seven
pale tints on near-white paper have about 0.08 of lightness to share, and the solver hit
its constraint floor. This is structural, not a bad colour choice.

**The fix is form, not colour.** Every badge carries a **3px left rule in its status
foreground**. A contiguous block of pure colour does not get diluted by compositing, so
it restores the full foreground separation:

| Signal | Dark | Light |
| --- | --- | --- |
| `paid` vs `overdue`, 3px rule at 11px | **8.2** | **13.7** |
| Worst of all seven, 3px rule at 11px | **4.4** | **4.2** |

So a badge carries three independent channels: the rule (chromatic), the marker
(categorical shape), and the label (text). Only the first is colour.

### 3.5 Known adjacency

Copper accent (OKLCH hue ~58) and `overdue` amber (hue ~88) are 30° apart. They are
separated by role and by form, not by hue: **copper only ever appears as a solid fill or
a 2px rule on interactive chrome; `overdue` only ever appears as a light foreground on a
dark tinted badge ground.** A copper "Send reminder" button and a gold "Overdue" badge
sit adjacent constantly in the ledger, so this must hold. If a later phase wants an
amber-filled element, change that element — not the accent.

---

## 4. Chart palette

Categorical series are keyed to provider and must not be reassigned between views —
Stripe is always violet.

| Series | Dark | Light | vs base (dark / light) |
| --- | --- | --- | --- |
| Stripe | `#a793f4` | `#6d54b7` | 7.21:1 / 5.49:1 |
| Paystack | `#57c8e6` | `#00829f` | 9.60:1 / 4.21:1 |
| Flutterwave | `#f3ae5f` | `#ad7227` | 9.80:1 / 3.79:1 |
| Manual | `#808a95` | `#40474f` | 5.32:1 / 8.86:1 |

All clear 3:1 against the page ground. Manual is deliberately the only achromatic
series — "not a processor" reads as absence of colour, and a grey anchors the set under
CVD where the three chromatic hues shift.

Minimum categorical separation (ΔE ×100): dark — normal 15.4, deuteranopia **8.2**,
protanopia **12.8**. Light — normal 15.8, deuteranopia **8.4**, protanopia **12.3**.

**Revenue movement**

| | Dark | Light |
| --- | --- | --- |
| Positive | `#87e8c4` | `#07553f` |
| Negative | `#fd9195` | `#d05a63` |

Worst-case CVD separation: dark **8.7**, light **12.4**. The light negative is a lighter
crimson than the `failed` status colour on purpose — the obvious choice (`#ad3946`)
measured ΔE **1.8** against positive under protanopia, effectively identical. Lightness
had to do the work that hue could not.

Movement always carries a **▲ / ▼ glyph** alongside the colour. For a delta rendered as
text rather than a mark, use the `failed` / `paid` status foregrounds, which are AA;
`--chart-negative` in light theme is 4.53:1 and is a mark colour only.

**Partial current month.** The in-progress month is never a solid bar — it renders at
`--chart-partial-opacity` (0.42) with a dashed stroke (`--chart-partial-dash`, `4 3`)
in its own series colour, plus an "in progress" axis label. This matters here: the
seeder already scales the current month by elapsed fraction, so a solid bar would read
as a real decline rather than an incomplete month.

Grid `--chart-grid` (`#242c36`) sits one step quieter than `--line-subtle`, which was
raised to 1.57:1 for table rules; axis labels use `--chart-axis` /
`--fg-muted` at `text-micro`.

---

## 5. Typography

Three families, each doing a job the others cannot.

| Role | Font | Why |
| --- | --- | --- |
| **Display** | **Newsreader** | A screen-first text serif with sharp, high-contrast detailing and a variable optical-size axis. At 3.5rem it has the engraved quality of a share certificate; it is editorial-financial rather than startup-editorial. Loaded **only on marketing and auth routes.** |
| **UI** | **IBM Plex Sans** | Drawn as an engineering typeface — flat terminals, a distinctive single-storey `a` at weight, real Bauhaus-derived character. It reads as instrument rather than brochure, and it is not Inter. |
| **Figures, IDs** | **IBM Plex Mono** | Shares skeletons and metrics with Plex Sans, so labels and figures sit in the same voice. Narrow for a mono, which matters in dense columns. |

Plex Sans and Plex Mono are a designed superfamily — pairing them is not a coincidence
of both being available. Newsreader supplies the deliberate counterpoint.

**The mono is the identity.** A data application cannot earn personality from imagery,
so it earns it from figures: every amount, invoice number, provider payment ID and
in-column date is set in Plex Mono with tabular figures. This is the ledger reference
made literal, and it is instantly recognisable.

### Scale

| Token | Size | Line height | Weight | Tracking | Family | Use |
| --- | --- | --- | --- | --- | --- | --- |
| `text-display` | 56px | 1.04 | 400 | −0.022em | Display | Landing hero only |
| `text-h1` | 34px | 1.16 | 500 | −0.018em | **Display** | Wordmark, empty-state headline — **`(marketing)` only** |
| `text-h2` | 24px | 1.25 | 600 | −0.014em | Sans | Page title, section, modal title, in-app empty state — **the ceiling in `(app)`** |
| `text-h3` | 18px | 1.35 | 600 | −0.008em | Sans | Card and section title |
| `text-h4` | 15px | 1.4 | 600 | −0.003em | Sans | Subsection, form group |
| `text-body` | 14px | 1.55 | 400 | 0 | Sans | Default |
| `text-small` | 13px | 1.45 | 400 | 0.002em | Sans | Table cells, help text |
| `text-micro` | 11px | 1.3 | 500 | 0.06em | Sans, uppercase | Column headers, form labels, **KPI labels**, metadata |

KPI figures use Plex Mono at **`text-h3` (18px), weight 500** — one size, every
tile, every width. This is the one place the mono appears large, and it is the
dashboard's typographic signature.

**This corrects an earlier rule.** `text-h1` was specified first, then `text-h2`
sized by tile count. Both came from arithmetic about character widths, and both
clipped when rendered: at 1440px the total-revenue figure overflowed its tile by
16px and at 1280px by 48px, silently truncating `₦80,164,039.41` to
`₦80,164,039.4`. **A truncated money figure is the worst defect this system can
produce** — it is wrong rather than merely ugly, and nothing on screen says so.

Measured, from the rendered page rather than from character counts:

| Figure | Width needed at 18px |
| --- | --- |
| `₦80,164,039.41` | ~149px |
| `≈₦28,511,740.72` (outstanding) | ~160px |

Add 32px of tile padding and **a KPI tile cannot be narrower than ~192px.**

### KPI row: size the columns, not the type

The column count follows a guaranteed minimum tile width, never breakpoint
variants:

```html
<section class="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
```

That yields five across from 1440px and four below it, with every figure whole.
Measured headroom is positive at 1024, 1280, 1366, 1440, 1600 and 1920, and tile
heights are uniform within each row at all of them.

Two traps this avoids, both hit while fixing it:

- **Type cannot absorb the shortfall.** Five columns inside the 248px sidebar
  leave 150px per tile at 1280px. The plain figure already needs 149px at 18px,
  so there is no size that fits five full-precision figures at that width. The
  column count has to give way; the number never does.
- **Tailwind v4 sorts arbitrary media variants ahead of named ones.** Both
  `min-[1440px]:grid-cols-5` and a custom `--breakpoint-wide` compiled *before*
  `lg:grid-cols-3` and lost at every width, silently. If a responsive utility
  appears to do nothing, check the compiled order before changing the value.

The approximation mark on a converted figure rides inside the `currency-mark`
span (`≈₦`) rather than sitting as a full-size character plus a space, which
cost 25px and made outstanding the only tile that overflowed.

### Numerals — non-negotiable

- **`font-variant-numeric: tabular-nums` on every figure that appears in a column.**
  Use the `money` utility (mono + tabular + −0.01em) or `tabular` (tabular only, for
  sans contexts). Money in a table cell that is not tabular is a bug.
- Money cells are **right-aligned**; text cells left-aligned; status badges left-aligned.
- The currency mark uses `currency-mark` — `--fg-muted` at 0.85em. In a column it lives
  in its own right-aligned span so all marks align and all digits align independently.
  `₦` `$` `£` differ in width; letting them share the digit column breaks the rag.
- Minor units are `bigint` in the database. **Format from the bigint, never via
  `Number()`** — a float round-trip on a ₦2,500,000.00 invoice is a correctness bug that
  will surface as a rounding discrepancy in a total.

### Loading

```ts
// src/app/layout.tsx — app shell
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});
```

```ts
// src/app/(marketing)/layout.tsx — marketing/auth segment ONLY
import { Newsreader } from 'next/font/google';

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  display: 'swap',
});
```

Newsreader is scoped to the marketing segment so the app shell ships two families, not
three. `globals.css` declares real fallbacks, so the app is legible before this lands.

---

## 6. Spacing, radius, elevation

### Spacing — 4px base

`0.5`=2 · `1`=4 · `2`=8 · `3`=12 · `4`=16 · `5`=20 · `6`=24 · `8`=32 · `10`=40 · `12`=48
· `16`=64 · `20`=80 · `24`=96 (Tailwind's default 4px scale; no override needed).

Conventions: 4 inside a badge · 8 between related controls · 12 table cell padding ·
16 card padding · 24 between cards · 32 between page sections · 64+ marketing sections.

### Radius — tight and engraved

| Token | Value | Applies to |
| --- | --- | --- |
| `--radius-xs` | 3px | **Status badges**, chips, checkboxes, tags |
| `--radius-sm` | 5px | Buttons, inputs, selects, table container |
| `--radius-md` | 8px | Cards, popovers, dropdowns, toasts |
| `--radius-lg` | 12px | Modals, sheets, drawers |
| `rounded-full` | — | Avatars and status dot markers **only** |

**Badges are stamps, not pills.** 3px at badge scale reads as a struck mark on paper.
This is a deliberate departure from the pill-badge default and is a large part of what
makes the ledger look like Settled rather than generic SaaS. Do not round them up.

### Elevation

**Dark lifts with background, light lifts with shadow.** On an ink ground a drop shadow
is nearly invisible and just muddies the edge; separation comes from stepping
`bg-base → bg-raised → bg-overlay` plus a `--line-default` border.

| Level | Dark | Light |
| --- | --- | --- |
| Flat | `bg-base`, no border | `bg-base`, no border |
| Raised (card, sidebar) | `bg-raised` + 1px `line-default`, **no shadow** | `bg-raised` + 1px `line-subtle` + `shadow-sm` |
| Overlay (popover, dropdown, toast) | `bg-overlay` + 1px `line-default` + `shadow-md` | `bg-overlay` + 1px `line-subtle` + `shadow-md` |
| Modal | `bg-overlay` + 1px `line-default` + `shadow-lg` + scrim | `bg-overlay` + `shadow-lg` + scrim |

Overlays keep a shadow in both themes — a floating layer needs to detach from content it
covers, and the border alone does not do it. Scrim: `rgb(0 0 0 / 0.62)` dark,
`rgb(25 32 41 / 0.36)` light.

---

## 7. Components

### Focus ring — applies to everything

```
--ring-focus: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--accent);
```

An inner 2px band in the page ground, then a 2px copper ring. The inner band punches the
ring away from whatever sits beneath, so **one definition works on every surface** —
table row, card, copper fill. Applied globally on `:focus-visible` (never `:focus`, so
pointer users get no ring on click).

**The global rule must live inside `@layer base`.** Tailwind emits generated utilities
into the `utilities` layer, and an *unlayered* rule beats every layered rule regardless of
specificity. While the global `:focus-visible` sat unlayered it silently overrode
`ring-inverse` on the primary button — the measured ring was copper on copper at
**1.00:1**, the exact failure `ring-inverse` exists to prevent, and no amount of
specificity in the utility could win. Anything that a utility is meant to override belongs
in `@layer base`.

On an accent-filled control, copper-on-copper vanishes — use the **`ring-inverse`**
utility, which applies `--ring-focus-inverse` (`accent-fg` band, `fg-primary` ring) and
beats the global rule on specificity:

```css
@utility ring-inverse {
  &:focus-visible { outline: none; box-shadow: var(--ring-focus-inverse); }
}
```

Apply it to any control filled with `--accent`: the primary button, an active filled tab,
a selected chip. Everything else inherits the global ring and needs no class.

**Measured on the login form** (Tab order: email, password, Sign in, demo link):

| Element | Band | Ring | Band vs fill | Ring vs band | Ring vs container |
| --- | --- | --- | --- | --- | --- |
| email / password | `#0e1319` | `#d7935e` | 1.09:1 | 7.31:1 | 6.71:1 |
| **Sign in** (`ring-inverse`) | `#0e1319` | `#ebeff4` | **7.31:1** | **16.15:1** | **14.84:1** |
| demo link | `#0e1319` | `#d7935e` | 1.09:1 | 7.31:1 | 6.71:1 |

Read the ring against what it **touches**. The outer ring never abuts the element fill —
the 2px band sits between them — so "ring vs fill" is not the governing number. On the
Sign in button that comparison is 2.21:1, which looks like a failure and is not one: the
ring's actual neighbours are the band at 16.15:1 and the card at 14.84:1, and the band
meets the copper fill at 7.31:1. Every adjacency clears 3:1 comfortably.

The band being only 1.09:1 against an input's fill is likewise fine — with the field now
taking the card's ground, the band reads as a thin dark outline and the copper ring at
6.71:1 is what carries the indication. Focus ring is measured at 7.31:1 (dark) and
5.41:1 (light) against the ground, well past the 3:1 required.

### Table

The core surface. Everything here is tuned for scanning, not for looking good in a
screenshot.

- **Row height** 44px default (dense ledger), 52px comfortable — a user preference in
  settings, persisted. Cell padding `12px` horizontal, first cell `16px`, last `20px`.
- **Cell text uses `--fg-body`, not `--fg-primary`.** 16.15:1 is 87% of the maximum this
  ground allows; dense 13px text at that level halates over a long read. Headings and KPI
  figures keep `--fg-primary` — large sparse text can take the contrast.
- **The table body sits on `bg-base`, not `bg-inset`.** Measured, `bg-inset` against
  `bg-base` is **1.02:1** — an invisible distinction that bought nothing. `bg-inset` is
  retained for input interiors, where a `line-strong` border does the separating.
- **No zebra.** A 1px `--line-subtle` rule between rows instead, at **1.57:1** — raised
  from an initial 1.32:1, where the rule dissolved over a long column. Zebra on an ink ground
  produces visible banding and fights the badge tints; hairline rules are the ledger
  reference and are quieter. This is a considered rejection, not an omission.
- **Sticky header**: `bg-base` (not raised — it must not read as a floating card),
  `text-micro` uppercase in `--fg-muted`, 2px `--line-strong` bottom border, `z-10`.
- **Hover**: `--row-hover` (**1.40:1**), `--duration-fast`. No transform, no shadow, no
  scale. The obvious choice, `bg-raised`, measures **1.09:1** against the ground — too
  weak to tell you which row you are on at row eighteen. Light theme reaches only 1.15:1;
  dark-on-light rows are anchored by their text, so the asymmetry is acceptable.
- **Selected**: `--accent-subtle` ground plus a 2px `--accent` left edge.
- **Footer / totals row**: `rule-double` utility — 1px `line-strong` with a 1px
  `line-subtle` 3px below. This is the ledger's double rule and it means *sum above*.
  Never use it decoratively.
- Money columns right-aligned, `money` utility, currency mark in its own span.
- Sort indicator: a 1px copper underline beneath the active column header, not an icon
  swap.

### Status badge

`radius-xs` · `padding 2px 8px` · `text-micro` uppercase · **3px left rule in the status
foreground** · marker glyph + 4px gap + label · `bg` = status subtle · `border` 1px =
status line (left border overridden to 3px status fg) · `color` = status fg. `void`
additionally sets `text-decoration: line-through` on the label. No hover state — badges
are not interactive.

The 3px left rule is the scannable element and is **not optional** — see §3.4. Without
it the badge column collapses to ΔE 2.0 (dark) / 0.3 (light). With the marker, it is
what makes "show me everything overdue" a glance rather than a read.

### Button

| Variant | Default | Hover | Active | Focus-visible | Disabled | Loading |
| --- | --- | --- | --- | --- | --- | --- |
| **Primary** | `accent` fill, `accent-fg` text | `accent-hover` | `accent-active`, `translateY(0.5px)` | `--ring-focus-inverse` | 40% opacity, `not-allowed`, no hover | Spinner replaces label; **width held** |
| **Secondary** | `bg-raised`, 1px `line-strong`, `fg-primary` | `bg-overlay`, border `fg-muted` | `bg-inset` | `--ring-focus` | 40% opacity | as above |
| **Ghost** | transparent, `fg-secondary` | `bg-raised`, `fg-primary` | `bg-inset` | `--ring-focus` | 40% opacity | as above |
| **Destructive** | transparent, 1px `failed-line`, `failed` text | `failed-bg` ground | `failed-bg`, border `failed` | `--ring-focus` with `failed` in place of accent | 40% opacity | as above |

Heights 32 / 36 / 40px (sm/md/lg), `radius-sm`, `text-small` weight 500, padding
`0 14px`, icon gap 6px.

Destructive is outline-first, not a red fill: on a ledger a solid red block reads as a
status, and Settled already uses red for `failed`. It only fills on hover, at the point
of intent.

**Loading holds width** — render the label at `visibility: hidden` with the spinner
absolutely centred. A button that resizes mid-submit moves the layout under the cursor.

#### Spinner

The one loading indicator. 14×14px, `stroke-width: 2`, `currentColor` so it inherits
the button's text colour in every variant and both themes:

- **Track**: full circle, `r=5.5`, `opacity 0.25`.
- **Head**: a 90° arc from 12 o'clock, `stroke-linecap: round`, full opacity.
- **Animation**: `animate-spin` (1s linear infinite).

```html
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" class="animate-spin">
  <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="2" opacity="0.25" />
  <path d="M12.5 7A5.5 5.5 0 0 0 7 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
</svg>
```

Always `aria-hidden`; the button carries `aria-busy` and `disabled`, which is what
assistive technology announces. Used in: the button loading state, inline saving
indicators, and the unmatched-queue matching action. **Not** used for page or table
loading — those get skeletons, which preserve layout.

Under `prefers-reduced-motion` the rotation collapses to 1ms via the global block, leaving
a static ring. That is intentional: the disabled button and `aria-busy` still communicate
the pending state without motion.

### Text input and select

- Default: **ground inherited from the container** (`bg-transparent`), 1px
  `--line-strong` (the 3:1 token — required), `radius-sm`, 36px, padding `0 10px`,
  `text-body`, `fg-primary`. Placeholder `fg-muted`.

  **This was `bg-inset` and that was wrong.** On the login card the rendered input came
  out at luminance 0.00496 against a card at 0.01128 — 44% of the card, and below even
  the page ground at 0.00629. It read as a hole punched through the card rather than a
  surface to type on, inverting the depth model §6 sets out. The cause is structural: the
  dark base `#0e1319` is close to the floor, so there is no room to recess beneath it, and
  `--bg-inset` at `#0b1015` is not a well but a void. The idiom works in light, where
  `#f0efeb` under a white card recesses correctly — but a token cannot mean "one step
  down" in one theme and hold up in the other when one theme has no step down to give.

  Taking the container's ground makes the field sit **at** its container in both themes,
  with the `--line-strong` border doing the bounding. Measured after the change: input
  luminance 0.01128, identical to the card, border 3.67:1 against it.

  `--bg-inset` survives for code and `<pre>` blocks, where reading as recessed is correct
  and nothing needs to be typed into it.
- Focus: `--ring-focus`, border → `--accent`.
- Error: border `--status-failed-line`, ring uses `failed`, message below in
  `text-small` / `failed` **with a `✕` glyph** — never colour alone.
- Disabled: `bg-base`, border `line-default`, text `fg-muted`, `not-allowed`.
- **Label**: `text-micro` uppercase in `--fg-muted`, 8px above the control, always a real
  `<label for>`. Deliberately the same treatment as a table column header — both name a
  field of data, and one voice for both is what makes a form read as part of the ledger
  rather than a separate application. Never use a placeholder as the label: placeholders
  vanish on focus and are not an accessible name.
- Numeric inputs (amount fields) use the `money` utility and right-align.
- Select uses the same box with a `--fg-muted` chevron; native `<select>` on mobile.

### Inline link

`--accent` with `underline underline-offset-2`, hovering to `--accent-hover`. The
underline is not optional: colour alone does not separate a link from emphasis, and the
accent also appears on non-interactive chrome.

```html
<a class="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover">
```

`rounded-xs` is there for focus. The global `:focus-visible` ring is drawn with
`box-shadow`, which follows the element's border-radius, and a `0` radius on an inline
element gives hard corners that clip awkwardly across a line break.

Focus-visible inherits the global ring — never add a per-link ring. The accent measures
7.31:1 (dark) and 5.41:1 (light) against the ground, so the ring reads on both.

A link that would navigate away from unsaved work is a button instead, so it can prompt.

### Card

`bg-raised` · `radius-md` · 1px `line-default` (dark) / `line-subtle` + `shadow-sm`
(light) · padding 16 (compact) or 24 (default). Title `text-h3`; optional description
`text-small` / `fg-secondary`; header separated by 1px `line-subtle` only when the card
contains a list or table.

### KPI stat tile

The dashboard's headline figures. A card, not a new primitive: `bg-surface-raised`,
`radius-md`, 1px `--line-default`, 16px padding, stacked `gap-1.5`.

| Slot | Treatment |
| --- | --- |
| Label | `text-micro` uppercase `--fg-muted` — the same voice as a column header |
| Figure | `money` at `text-h3` (§5 — one size at every width), `--fg-primary` |
| Currency mark | `currency-mark` inside the figure, so marks and digits align down a column of tiles |
| Note | optional, `text-small` `--fg-muted`, one or two lines |

Rules:

- **Never abbreviate money on a tile.** `₦80.2m` is not reconcilable against a
  ledger, and the point of the figure is that someone can check it. If it does
  not fit, **the column count drops** (§5) — not the number, and not the type,
  which has already been sized as small as it usefully goes.
- **A tile is never narrower than 215px.** Below that a full-precision figure
  clips, and a clipped figure is silently wrong.
- **A derived or converted figure must say so.** The outstanding tile carries a
  `≈` prefix and a note reading "approx. at live FX", with the exact
  per-currency amounts beneath it. A mixed-currency total is rate-dependent, and
  presenting it as exact would misstate the precision rather than round it.
- A tile whose figure is a **count** rather than money still sets the numeral in
  `money`, so it aligns with its neighbours.
- Colour on the figure only where the count *is* the state — the overdue tile
  uses `--overdue` with its `▲` marker. Everything else is `--fg-primary`.
- No hover, no shadow, not a link. A tile is a readout.

### Inline page banner

A persistent, page-level notice — distinct from a toast, which is transient and
floats. The banner sits in the document flow directly beneath the app header,
spans the shell, and does not dismiss.

`bg-surface-raised`, a 1px `--line-subtle` bottom border only (no radius and no
side borders, because it spans the shell), `px-6 py-2.5`, `text-small` in
`--fg-secondary`, a `--fg-muted` glyph leading, and any link in `--accent`
underlined.

Use it for a standing condition the reader needs in order to interpret the page:
the demo banner ("this data resets nightly"), a degraded-integration warning, a
read-only notice. **Do not** use it for the outcome of an action — that is a
toast — or for a validation error, which belongs beside its field.

A warning variant carries status colour as a 2px left rule, the same pattern as
the toast. The neutral informational form has no rule at all.

### Modal

`radius-lg` · `bg-overlay` · `shadow-lg` · max-width 520 (confirm) / 720 (form) ·
padding 24 · scrim per §6. Header `text-h2` + close ghost button; footer actions right
aligned, primary last. Focus trapped, returned to trigger on close. `Esc` closes unless
a form is dirty, which prompts. Enter: 180ms fade + 8px rise (`--duration-normal`,
`--ease-out-quint`); exit 120ms fade only.

### Toast

Bottom-right desktop, top on mobile. 320–420px, `radius-md`, `bg-overlay`, 1px
`line-default`, `shadow-lg`. **Status conveyed by a 2px left rule** in the status
colour, not a full tint — a fully tinted toast competes with the badges beneath it.
Icon + message `text-small` + optional action. Auto-dismiss 5s (success) / never
(error). Enter: slide 8px + fade, `--duration-normal`. Stack max 3, oldest evicted.

### Tab

Underline, not pill. Inactive `fg-secondary`; hover `fg-primary`; active `fg-primary`
with a 2px `--accent` rule beneath. The rule animates position and width over
`--duration-fast` — functional, it tracks the selection. 40px height, 16px gap,
container has a 1px `line-subtle` bottom rule the active rule sits on.

### Empty state

**Moderate ambition — a designed moment, sized to where it appears.**

Centred, max-width 420. One sentence in `fg-secondary` below the headline. One primary
action. Behind it, an engraved guilloché SVG at **4% opacity**, no animation.

The headline depends on the segment, because Newsreader only loads in one of them (§5):

| Where | Headline | Face |
| --- | --- | --- |
| `(marketing)` — landing, login, auth and error surfaces | `text-h1` | **Newsreader** |
| `(app)` — ledger, payments, queue, settings, and every in-app empty state | `text-h2` | **Plex Sans**, weight 600 |

Do not reach for `text-h1` in `(app)` to make an empty state feel bigger. It will render
in the fallback serif, which reads as a bug rather than a bolder choice. The guilloché
plate and the centred composition are what carry the moment in-app; the display face is
not available and is not needed.

Distinguish two cases:
- **First-run empty** (no invoices ever): the full treatment above.
- **Filtered empty** (no results for this filter): two lines of `text-small` and a clear
  filters link. No display type, no artwork, no plate. The user is mid-task and does not
  want a moment.

### Skeleton

`bg-raised` blocks at `radius-xs`, matching the real content's box exactly. Shimmer is a
translating linear-gradient, 1.4s linear infinite, `--line-subtle` → `--bg-overlay` →
`--line-subtle`. Under `prefers-reduced-motion` the shimmer is removed entirely,
leaving a static block — no pulse. Table skeletons render the real row height and column
widths so nothing shifts on load.

### Pagination

32px targets, `text-small`, `money` utility for the numbers. Current page marked with a
2px copper underline — the ledger rule again, not a filled pill. Prev/next are ghost
buttons; disabled at the ends. Row-count select on the left, `Showing 1–50 of 247` in
`text-small` / `fg-muted` centred, controls right. Server-side pagination — do not fetch
the full ledger.

---

## 8. Layout

**Sidebar** 248px expanded, 60px collapsed to an icon rail. Manual toggle persisted to
`localStorage`; auto-collapses below 1280px; becomes an overlay drawer below 900px.
`bg-raised`, 1px `line-default` right edge. Active item: `accent-subtle` ground + 2px
`accent` left rule + `fg-primary` label. Collapsed rail shows tooltips on hover.

**Content max-width** 1600px for data pages with 24px gutters (32px at ≥1280px) — the
ledger wants width. Forms and settings constrained to **720px** regardless of viewport;
a 1600px-wide form is unusable. Marketing 1200px, prose 68ch.

**Page header** Optional breadcrumb (`text-micro`, `fg-muted`), title `text-h2`,
optional description `text-small` / `fg-secondary`, action cluster right-aligned.
20px vertical padding, 1px `line-subtle` bottom rule. On table pages it sticks and
compacts 72px → 52px on scroll, dropping the description.

**Narrow screens: horizontal scroll with a sticky first column.** Not card-stacking.
Justification: a ledger is read by comparison — is this amount larger than that one, are
these three all overdue. Card-stacking destroys column alignment, which destroys the
tabular figures that are the entire typographic premise, and turns a 50-row scan into 50
screens of scrolling. Horizontal scroll preserves the table; the invoice number column
stays pinned so a row is always identifiable. The scroll container is
`overflow-x: auto` with `-webkit-overflow-scrolling: touch` and a right-edge fade to
signal more content. Card-stacking is correct for feeds; this is not a feed.

The public demo dashboard is the exception: its summary cards stack normally, since they
are cards already rather than a table.

**Below 900px the sidebar becomes a horizontal scrolling strip, not an overlay
drawer.** This is a decision, not an unfinished drawer.

The nav has five fixed destinations and no hierarchy. A drawer would introduce a
mode — open/closed state, a scrim, focus trapping, an escape key, a
restore-focus path — to reach five links that fit on one line. The strip keeps
every destination visible and one tap away, and costs no state at all.

Revisit it when the nav outgrows one line at 360px, or when it gains nesting. At
that point a drawer earns its complexity; today it would only add failure modes.

The strip: `bg-surface-raised`, 1px `--line` bottom border, `overflow-x-auto`,
4px item gap, 32px targets, and the same active treatment as the rail
(`--accent-subtle` ground). It replaces the rail rather than sitting alongside
it.

**Breakpoints** `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 (Tailwind
defaults), plus two app-specific thresholds: **900px** sidebar → drawer, **1280px**
sidebar auto-collapse.

---

## 9. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--duration-instant` | 80ms | Press feedback, hover colour |
| `--duration-fast` | 140ms | State change, row hover, tab rule |
| `--duration-normal` | 220ms | Popover, dropdown, toast, modal |
| `--duration-slow` | 380ms | Sheet, drawer |
| `--duration-expressive` | 700ms | **Landing page only** |
| `--ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | State transitions |
| `--ease-in-out-soft` | `cubic-bezier(0.65, 0, 0.35, 1)` | Reversible movement |

### Using the duration tokens

Tailwind v4 has no theme namespace for named transition durations — `--duration-*` cannot
become a `duration-fast` utility the way `--color-*` becomes `bg-*`. The tokens therefore
live in a plain `:root` block rather than in `@theme`, and are referenced through an
arbitrary value:

```html
<button class="transition-colors duration-[var(--duration-fast)] ease-standard">
```

**That is the standard pattern, not a workaround.** Never write `duration-150`: a literal
is untethered from the scale and will not follow a change to the token. The easing tokens
*are* in `@theme`, so `ease-standard`, `ease-out-quint` and `ease-in-out-soft` are real
utilities and should be written as such.

### The `settled-shimmer` keyframe

Skeleton loading (§7). A gradient translated across the block rather than an opacity
pulse, so the block holds a constant luminance instead of flashing:

```css
@keyframes settled-shimmer {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}
```

Applied as `animate-[settled-shimmer_1.4s_linear_infinite]` on an absolutely
positioned gradient overlay inside the block. Pair it with
`motion-reduce:animate-none` at the call site: §7 asks for the shimmer to be
*removed* under reduced motion, not slowed, leaving a static block.

### The `enter` utility

The single fade-and-rise permitted on moderate-ambition surfaces. Defined in `globals.css`
as `@keyframes settled-enter` plus `@utility enter`:

```css
@utility enter {
  animation: settled-enter var(--duration-slow) var(--ease-out-quint) both;
}
```

Opacity 0 → 1 with an 8px rise, 380ms. `both` holds the start frame so the element
cannot flash at full opacity before the animation runs.

**Permitted on:** login, empty states, error pages — one element, once.
**Forbidden on:** dashboard, ledger, tables, forms, settings (§2). If a screen is opened
more than once, it does not animate in.

The reduced-motion block collapses it to 1ms, so the element appears without movement.

**Landing** may use staggered reveals (60–80ms stride), scroll-linked parallax on
background plate work, and a counting animation on headline figures.

**Application surfaces get functional motion only**: colour and background transitions
on hover/active, the tab rule tracking selection, popover and modal enter/exit,
skeleton shimmer. **No entrance choreography on any screen reached more than once** —
the dashboard does not stagger its cards in, the table does not fade its rows. Motion
that replays on a screen opened forty times a week becomes latency.

Animate `opacity` and `transform` only. Never animate `height`, `top` or `width` on a
data surface.

**Reduced motion** collapses every duration token to 1ms and forces
`animation-duration`/`transition-duration` to 1ms globally. Durations collapse rather
than transitions being removed, so a state change still *reads* as a change — an
instant swap is clearer than no feedback. Skeleton shimmer and all transform-based
entrances are removed outright.

---

## 10. Deviations from the brief

1. **Tokens are hex, not OKLCH.** The palette was designed in OKLCH and several
   light-theme values sat marginally outside sRGB, where the browser clamps them — so
   the OKLCH I wrote and the colour that rendered would differ, and the measured ratio
   would describe the wrong colour. Shipping the clamped hex means the token *is* what
   renders. OKLCH coordinates are preserved in the scratch solver for future
   manipulation.

2. **Light-theme CVD separation is 7.6, against my 8.0 target.** Fully argued in §3.3.
   Structural to light themes, mitigated by the mandatory status markers.

3. **`globals.css` does not load the fonts.** `next/font/google` generates `@font-face`
   at build time and cannot be invoked from CSS; the alternative — `@import` from
   Google Fonts — is render-blocking and gives up Next's font optimisation. The CSS
   declares `--font-display/sans/mono` with real fallbacks and consumes
   `--font-newsreader` / `--font-plex-sans` / `--font-plex-mono`. **`layout.tsx` is not
   modified** (§5 has the exact snippet), because the brief said not to build pages.
   Until that paste lands the app renders in the fallback stack.

4. **Two shadow-override blocks instead of one.** `[data-theme="light"]` and the
   `prefers-color-scheme` block are duplicated rather than combined, because a combined
   selector using `:not([data-theme="dark"])` would match the default no-attribute
   state and apply light shadows to the dark theme.

5. **`overdue` is amber despite the adjacency with copper** (§3.4). Moving it would have
   meant either red (colliding with `failed`) or a hue that reads as neither urgency nor
   warning. Separated by role and form instead, with the constraint documented so a
   later phase does not break it.

---

## Measurement method

Contrast is WCAG 2.1 relative luminance on sRGB. CVD uses the Machado (2009) severity-1.0
matrices for protanopia and deuteranopia applied in linear RGB; separation is Euclidean
distance in OKLab ×100, where JND ≈ 2.

The palette was not hand-picked. Candidate sets were generated by constrained
hill-climbing over lightness and chroma with hue fixed by semantics, maximising the
worst-case pairwise CVD distance subject to AA on both the subtle badge ground and the
page ground, plus a semantic-ordering constraint (`void` must read dimmer than `draft`
in both themes). Four solves were run; the shipped set is the dark result of the second
and the light result of the third, then hand-corrected for `line-strong` (3:1) and the
light revenue pair.

Every number in §3 and §4 was measured from the final hex values, not from the OKLCH
inputs. To re-verify after any change, re-run the measurement over the new hexes — do
not reason about contrast by eye.
