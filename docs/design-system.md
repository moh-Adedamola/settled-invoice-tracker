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

**A note on who sees these surfaces**, because it is easy to read "public" off the
ambition column and it is not there. Ambition and audience are independent axes. `/demo`
is a restrained app surface that happens to be public; `/invoices` is the same surface and
is not. **Every route that renders a record — invoices, payments, clients — requires a
session**, because a client who engaged the agency did not agree to appear on a public web
page, and a database that today holds only seeded rows is a property of the seed rather
than a licence. `/demo` is public on the strength of the nightly reset, which is a
guarantee about the data and not a statement about dashboards being less sensitive than
ledgers. The rule is written out in full at the top of `src/lib/auth/guard.ts`, next to
`requireUser`, so it is settled once rather than re-argued per page.

---

## 3. Colour

### 3.1 Semantic core

**Light is the default.** Ledger paper is what money software has looked like for four
hundred years, and it is what someone with no stored preference and no OS preference
should get. Dark is opt-in via `[data-theme="dark"]`, falling back to the OS preference
when the reader has expressed no explicit choice.

That ordering is structural, not a toggle in a config: the bare `:root` block carries the
LIGHT values, `[data-theme="dark"]` overrides them, and a `prefers-color-scheme: dark`
media query guarded on `:root:not([data-theme="light"]):not([data-theme="dark"])` mirrors
the dark block for readers who have chosen neither.

**Two tokens are theme-independent and live only in the base:**
`--chart-partial-opacity` and `--chart-partial-dash`. They are geometry rather than
colour — a dashed partial bar is dashed in both themes — and they sat in the old dark
`:root` only because that block happened to be the base. Inverting the default without
moving them would have left them undefined on paper.

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
| `text-hero` | **clamp(2.5rem, 7.2vw, 5rem)** | 1.02 | 400 | −0.025em | Display | Landing hero only |
| `text-display` | 56px | 1.04 | 400 | −0.022em | Display | Fixed display step |
| `text-h1` | 34px | 1.16 | 500 | −0.018em | **Display** | Wordmark, empty-state headline — **`(marketing)` only** |
| `text-h2` | **clamp(1.5rem, 1.393rem + 0.45vw, 1.75rem)** — 24→28 | 1.25 | 600 | −0.014em | Sans | Page title, section, modal title, in-app empty state — **the ceiling in `(app)`** |
| `text-h3` | **clamp(1.1875rem, 1.147rem + 0.17vw, 1.25rem)** — 19→20 | 1.35 | 600 | −0.008em | Sans | Card and section title |
| `text-h4` | **16px** | 1.35 | 600 | −0.003em | Sans | **The headline of a stacked list entry**; subsection, form group |
| `text-body` | 14px | 1.55 | 400 | 0 | Sans | Default |
| `text-small` | **14px below `md`, 13px at `md`+** | 1.45 | 400 | 0.002em | Sans | Table cells, help text |
| `text-micro` | 11px | 1.3 | 500 | 0.06em | Sans, uppercase | Column headers, form labels, **KPI labels**, metadata |

#### What 390px measured, and what it changed

Rendered scale on `/payments` at 390×844, before: **24 / 13 / 11 / 10**. A 3955px page
whose only typographic emphasis was the word "Payments". `text-h3` and `text-body` did not
appear on it at all.

That is two faults, and they need opposite fixes.

**The scale had a non-step.** `text-body` 14px against `text-small` 13px is **1.077×** —
measured side by side on `/dashboard`, indistinguishable at arm's length. Two body sizes
that close are one body size and a rendering bug. 13px earns its density in a table, and
§8 renders no table below `md`, so the step now simply goes away where it stops paying:
`text-small` computes to 14px below `md` and returns to 13px above it. **Below `md` there
is exactly one body size.**

**The pages skipped rungs.** The 1.85× cliff from 13px to 24px was not a missing token —
`text-h3` and `text-h4` were both defined and neither was used in a list. So `text-h4`
moves 15px → **16px** and acquires a stated job: *the headline of a stacked list entry* —
the client name on a payment card, the invoice number on a match candidate. At 15px it sat
1.07× above body, the same non-step being removed elsewhere. At 16px against 14px it is
1.14×, carried the rest of the way by weight 600 against 400.

`text-h3` moves 18px → **19px** at the low end for a related reason: a card title at 18px
against row headlines at 16px is 1.125× apart, and the card title did not separate from its
own contents. 19/16 is 1.19×.

**The rendered ladder at 390px is now 24 / 19 / 16 / 14 / 11** — steps of 1.26, 1.19, 1.14,
1.27. The 1.14 is the weakest and is the one weight carries.

#### `text-h2` and `text-h3` are fluid; the rest are not

Three fluid steps now, on the same argument `text-hero` established: a heading that is
right at 1440px is not right at 390px, and a fixed step has to be wrong at one end.

- `text-h2` — 24.04px at 390, 28px at 1440. The low end is deliberately today's fixed
  value; 24px measured correctly as a page title on a phone and there was no reason to
  move what was already right. The change is at the desktop end.
- `text-h3` — 19.01px at 390, 20px at 1440.

Everything below h3 stays fixed. Body text does not want to track the viewport — it wants
to be 14px — and a scale where every step moved would make vertical rhythm unpredictable at
every width, which is the reason this section gave for keeping `text-hero` alone in the
first place. Three exceptions, all headings, all justified individually.

**`text-hero` does not replace `text-display`.**
§2 opens the landing page to "display type at 3.5rem+", which a fixed step cannot express:
56px is too large beside a 360px viewport and too small across 1920px. So the hero tracks
the viewport between 2.5rem — two words per line at 360px, measured — and 5rem, the
ceiling that allowance implies.

Everything else stays fixed on purpose. A section heading sits against known spacing and
wants a number rather than a range; a scale where every step moved would make vertical
rhythm unpredictable at every width. One step is fluid because exactly one surface needs
it, and `text-display` remains the 56px step for any display-face heading that is not the
landing hero.

KPI figures use Plex Mono at **`text-h3`, weight 500** — one size, every tile, at `md` and
above. This is the one place the mono appears large, and it is the dashboard's typographic
signature.

**Below `md` the row is not a row of tiles and the rule does not apply.** `auto-fit`
resolves to one column at 390px, so five equal tiles became five identical bordered boxes
stacked 604px tall with every figure at the same size and weight — a five-way tie, on the
page whose whole job is to say what matters. The phone layout is three tiers instead
(§8, "The dashboard on a phone"), and the tier is what sets the size: **`text-h2` for the
hero figure, `text-h4` for an alert count, `text-small` for context.** One size per tier,
which is the same rule applied to a layout that has tiers.

Measured before committing to `text-h2`: the widest figure this renders,
`≈₦38,689,993.98`, is ~216px against a 308px content box at 390px.

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

Conventions: 4 inside a badge · 12 table cell padding · 16 card padding.

### Separation — four steps that mean four things

The numeric scale above is what is *available*. These four tokens are what a layout
**chooses**, and layout spacing uses them rather than raw steps.

| Token | <`md` | `md`+ | Expresses |
| --- | --- | --- | --- |
| `gap-within` / `p-within` | 8px | 8px | Label to its control, chip to chip, icon to text |
| `gap-group` | 16px | 16px | Field to field; **entry to entry inside a list** |
| `gap-section` | **28px** | 24px | Card to card, section to section |
| `gap-region` | **48px** | 32px | Filter panel to results, page header to body |

#### Why this exists

Measured at 390×844, the whole application used **five or six distinct gap values topping
out at 24px**, and 24px was doing two incompatible jobs — "a new major section begins" and
"the next row of this form". Neither reading survived. Most gaps were literally zero: 31 of
63 on `/dashboard`, 25 of 40 on `/payments`.

The marketing page, from this same tokens file, measured **thirteen distinct gaps reaching
56px**, and spends 40–56px exclusively on section breaks. That is the whole of why one
reads as composed and the other as a wall. The app had no gap that means *stop here*.

Naming them for the relationship rather than the number is the point: `gap-6` at a call
site records a pixel count, and every reviewer who sees it has to re-derive what it was for.
`gap-region` records the intent, and the system can then change the pixels at a breakpoint
without visiting the call site.

#### The two large steps get bigger on a phone, not smaller

This is the counterintuitive half, and it is the direct answer to *24px cannot mean both*.

At 1440px a card's own edges, the column gutter and the whitespace either side of the
measure are all doing separation work, so the gap between two cards is one signal among
several. At 390px none of those exist — the column is the full width, and every block is
the same width as every other block. Vertical distance is the **only** grouping signal
left, so it has to carry more, not less. Hence 28/48 at touch against 24/32 at pointer.

#### Stacked entries are separated, never merely divided

A hairline between two identical blocks says *these are rows of one thing*. It does not say
*this is a different payment*. Measured: 25 consecutive 115px cards on `/payments` at **0px
apart**, 20 match candidates at **0px apart**, distinguished only by a 1px rule.

The rules:

1. **A stacked list entry never has a zero gap below `md`.** `gap-group` (16px) is the
   floor for a multi-line entry; `gap-within` (8px) for a single-line one.
2. **A run longer than eight entries carries grouping headers — when the groups are
   groups.** Date, status, or initial, whatever the list is actually ordered by.
   `gap-region` above the header, `gap-group` below it.

   **This rule was written from the run length and it is only half right.** Built on
   `/payments`, which renders 25 entries, day grouping took the page from **3955px to
   4914px**: the 25 payments fall across ~18 distinct days, so it produced roughly one
   header per card, and each singleton day paid a header, a `gap-region` and a `gap-group`
   to separate one item from one item — 61px of chrome per payment to say what the card
   already said.

   That is a fact about this domain rather than about that page: a business issuing 54
   payments over six weeks has one or two on most days. **Check the average group size, not
   the run length.** Below roughly three entries per group the header is a label, not a
   group, and the differentiation has to come from inside the entry instead.
3. **Entry height varies with content below `md`.** No fixed-height list rows.

On (3), `/clients` is the accidental proof and is worth copying deliberately: its cards
measured 89–103px because email addresses differ in length, and that variation alone was
enough that the repetition detector never registered a run — while `/payments`, whose cards
are a fixed 115px, registered a run of 25. Equal-height rows are a table's virtue. A
stacked list is not a table, and inheriting that virtue is what produced the wall.

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

### Control size — one scale, two ends

**Every interactive control clears 44×44px below `md`.** Use the tokens; do not write
heights at call sites.

| Token | <`md` | `md`+ | Applies to |
| --- | --- | --- | --- |
| `h-control-sm` / `size-control-sm` | **44px** | 32px | Ghost and compact controls, nav items, sort headers, theme toggle |
| `h-control` | **44px** | 36px | **The default** — buttons, inputs, selects, textareas |
| `h-control-lg` | **48px** | 40px | The primary action of a page or form |
| `size-mark` | 16px | 16px | The *visual* box of a checkbox or radio — **not** its hit area |

Below `md` there are only two distinct values, because the difference between 32px and 36px
is one a pointer can use and a finger cannot.

**Two deliberate exceptions, both raw and both correct:**

- **The landing page's two hero CTAs are `h-11` (44px) at every width.** §2 gives that page
  full ambition and its call to action is one size everywhere; no control token expresses
  "fixed 44 at all widths", and `h-control-lg` would shrink them to 40px at desktop. They
  already clear the minimum, so the token would cost something and buy nothing.
- **`h-11` on a table cell is a row height, not a control height** (§7, Table: 44px rows).
  Tables only render at `md` and above, where the control scale is a different number for a
  different reason. Do not "fix" those to `h-control`.

`h-control-lg` is currently unclaimed — it exists for a page whose primary action should
outweigh its secondaries, and nothing has needed that yet.

#### What was measured

At 390×844: **21 of 21** controls on `/invoices/new`, **24 of 25** on `/settings`, **15 of
16** on `/dashboard` rendered under 44×44. Every one of them was `h-8` or `h-9`. Checkboxes
measured **12×12px** in the filter panels and 14×14px in settings. The list card row, at
94–115px, was the only element in the product that cleared 44px — and it clears it by
accident of content, not by specification.

#### Why they step down at `md` rather than staying large

44px is a **touch** minimum, not a universal one. WCAG 2.2 AA (2.5.8 Target Size, Minimum)
sets the universal floor at 24×24 CSS px, which 32px already clears; the 44×44 figure is
2.5.5 AAA and Apple's 44pt, and both are stated about fingers.

A ledger is read by comparison down a column. A 1600px table of 44px rows shows roughly a
third fewer rows than one of 32px rows and buys a mouse nothing for it — density is the
product at desktop and a hazard at touch, so the scale says so rather than picking one and
making the other wrong.

#### Why the threshold is a width query and not `pointer: coarse`

`(pointer: coarse)` is the semantically correct question and the wrong one to ask. It
answers for the *primary* pointer, so a touchscreen laptop reports coarse and gets 44px
controls in a 1600px ledger, while an iPad driven from a Magic Keyboard reports fine and
gets 32px controls under a finger. Both fail in the direction that matters.

`md` is also already this application's touch boundary — §8 puts the table → stacked-entry
switch there on a separate argument about column comparison. One threshold governs both, so
no page can render 44px controls above a table or 36px controls above a card list.

#### Growing the hit area without growing the control

Some controls are the right size and the wrong target: a 16px checkbox, a `← Invoices` back
link measuring 71.9×14, an inline client-name link at 138.8×17. A 44px box around a tick, or
a slab of dead ground around a word, fixes the target and breaks the design.

`tap-target` draws a centred pseudo-element at `min(--tap-min)` — 44px below `md`, 0 above
it. The `::after` belongs to the control's own box, so it is genuinely tappable area rather
than a decoration that looks like one.

**It is for isolated controls only.** Two of them side by side overlap, and the overlap goes
to whichever paints later rather than to whichever the reader aimed at. A 28px control in a
row of three needs 44px of *real* box each — three 44px overlays fighting over 84px of strip
means the reader aims at "system" and gets "dark", which is worse than the small target was.
**Grow the real box in a group; overlay only where nothing sits within 44px.** The theme
toggle is the worked example: three segments, all `size-control-sm`, measured 44×44 at 46px
centres with no overlap.

#### Checkbox and radio — the mark is not the target

The common case, and the one that measured worst. The **label** is the control's hit area,
so give the label the height and the input the mark:

```html
<label class="inline-flex min-h-control cursor-pointer items-center gap-2 md:min-h-0">
  <input type="checkbox" class="size-mark shrink-0 accent-[var(--accent)]" />
  <span class="text-small">Succeeded</span>
</label>
```

`min-h-control` rather than `h-control`: a filter chip whose label wraps to two lines needs
to grow past 44px, not clip. `md:min-h-0` returns the row to its natural height at pointer
widths, where the label text alone is the target and 44px of vertical padding around a chip
would be dead space.

A bare `<input type="checkbox">` with no wrapping label has no hit area to grow and no
accessible name either. It is always a bug; fix the name and the target follows.

### Focus ring — applies to everything

**The rule, in one line:** `:focus-visible` for simple controls, `:focus-within` for
composite inputs with internal segments.

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

**Composite inputs take `:focus-within` instead.** A native `input[type="date"]` is not
one control; it is three fields in a shadow tree — day, month, year — and Tab walks
between them. Measured in Chrome 141 on the invoice filter bar, tabbing across the
segments of a single field:

| Segment | Host matches `:focus-visible` | Ring |
| --- | --- | --- |
| day | yes | painted |
| month | yes | painted |
| **year** | **no** | **none** |

The ring disappears on the last segment with the caret still inside the field. That is a
keyboard user losing their position mid-input, and it is not something the element's own
markup can fix — the mismatch is between where focus really is and which pseudo-class the
host element matches. `:focus-within` is true for as long as focus is anywhere in the
subtree, which is the honest description of what the ring is claiming.

```css
input[type='date']:focus-within,
input[type='datetime-local']:focus-within,
input[type='month']:focus-within,
input[type='time']:focus-within,
input[type='week']:focus-within {
  outline: none;
  box-shadow: var(--ring-focus);
  border-radius: var(--radius-sm);
}
```

Scoped to the segmented types, never applied to `input` at large. On a simple text input
`:focus-within` and `:focus` select the same element, and that set includes pointer
clicks — precisely the ring the `:focus-visible` rule exists to withhold. Widen this list
only for a control that genuinely holds focusable children; a custom combobox or a
segmented code entry qualifies, a styled text field does not.

Both rules live in `@layer base`, for the reason above.

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
  **It does not currently pin.** The markup is right and the offset is right; the
  scrollport is not. See *Sticky header — specified, not shipped* below before relying
  on this, or before "fixing" a `top` value that is already correct.
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
  swap. See **Sortable column header** below — the visual mark is only half of it.

#### Sticky header — specified, not shipped

The bullet above has described a sticky column header since the first draft. **The header
has never pinned.** Not in one table, not at one width, not in one theme — the
declaration has been inert in all five tables for as long as they have existed, and the
spec has been describing an app nobody was shipping.

**Measured** on `/invoices` at 1440×900, Chromium 141, scrolled to y=700: the `<th>`
computes `position: sticky`, its `top` resolves, and its bounding rect sits at **−254.7px**
— a quarter of a screen above the viewport, travelling with the rows. At 768×1024 scrolled
to the document floor it sits at −134.6px. The column names are simply gone.

**Why.** `<ScrollCue>` wraps every table in `overflow-x: auto` to carry the horizontal
scroll between the two pinned columns. CSS resolves the other axis along with it: when one
axis is not `visible`, the other computes to `auto` too. So that wrapper — not the page —
is the nearest scrollport for the `thead`, and a sticky element is positioned against its
nearest scrollport and nothing else. The wrapper has no height cap, so its `scrollHeight`
equals its `clientHeight` (**1135 = 1135**, measured), which means it never scrolls
vertically, which means it never pins anything. `position: sticky` inside a scrollport that
cannot scroll is a no-op, and it fails silently: no warning, no visual artefact, nothing to
notice unless you scroll a long ledger and register an absence.

This is not a bug in the table markup. `top` is correct, `z-10` is correct, the ground is
correct. Changing any of them changes nothing.

**The switch**, if it is ever wanted, is one property: give that wrapper a bounded height
(`max-height` in the region of `100dvh` minus `--sticky-top` and the page chrome above it),
which turns it into a real vertical scrollport and switches every header on at once.

**And it is deliberately not taken.** Page-scroll is the right behaviour for a ledger. A
pane-scrolled table inside a page-scrolled document gives the reader two scroll positions
to hold in their head, strands the pagination control below a viewport-height box, and
makes the wheel's behaviour depend on where the pointer happens to be. That is worse than a
header that scrolls away. **The header scrolling away is the accepted cost of page-scroll,
not an outstanding defect.** Anyone re-opening this should be arguing against page-scroll,
not reaching for `max-height`.

**`--sticky-top` is already coordinated for it.** All ten header cells across the five
tables read `top-[var(--sticky-top)]`, not `top-0`. The token (globals.css, and §8) resolves
to `49px` below 900px — where the shell's horizontal nav strip is pinned across the top of
the scrollport — and to `0` at and above 900px, where navigation is the vertical rail and
nothing is pinned above the content. That band is real rather than theoretical: the table
replaces the stacked card list at 768px, but the strip does not give way to the rail until
900px, so there are 132px of viewport width where a header pinning at `top: 0` would pin
*underneath* the nav. So the offset is live, correct, and currently unobservable. Leave it
alone.

#### Sortable column header

Use `SortableColumn` from `@/components/ui/sortable-column`. It renders the `<th>`
itself, not just the link inside it. **Do not hand-write a sortable `<th>`**, and do not
reintroduce a per-table `SortLink`.

```tsx
<SortableColumn
  href={sortHref('amount')}
  label="Amount"
  active={sort === 'amount'}
  direction={direction}
  align="right"
  className={`${headCell} sticky right-0 z-20 border-l border-line pr-5 text-right`}
/>
```

The rule it exists to enforce:

| Column | Markup |
| --- | --- |
| sorted, this direction | `<th aria-sort="ascending">` / `"descending"` |
| sortable, not sorted now | `<th aria-sort="none">` |
| not sortable at all | plain `<th scope="col">`, **no** `aria-sort` |

**`aria-sort` goes on the `<th>`, never on the link inside it.** It is defined only for
the `columnheader` and `rowheader` roles, so on an `<a>` — whose role is `link` — it is
ignored outright. Both the ledger and the client list shipped it that way, which meant
the sort state was carried entirely by a copper underline and an `aria-hidden` arrow:
available to anyone who could see the header, and to nobody else. A screen reader
announced a table of fourteen rows with no indication of what had ordered them.

`aria-sort="none"` is not padding — it means *sortable, not sorted right now*, which is
what tells a reader the other columns are also things they can sort by. Omitting the
attribute says the opposite, so a column that genuinely cannot be sorted is the only one
that leaves it off.

**Measured in Chrome's internal accessibility tree** (`chrome://accessibility`, `blink`
API type — the tree every platform accessibility API is mapped from), not in the markup.
Across six sort states over both tables: exactly one `columnHeader` per table reports a
`sortDirection`, it is the expected column in the expected direction, every other
sortable column reports none, and the unsortable ones carry no ARIA attribute at all.
The control that makes this worth anything is the old markup: with `aria-sort` on the
`<a>`, **no** column reports a direction — the tree cannot see it, which is exactly the
bug.

Two notes for whoever measures this next. CDP's `Accessibility.getFullAXTree` does **not**
serialise `sort` — a control page with `aria-sort="ascending"` comes back with only
`readonly` and `required`, so that API cannot answer this question and a green run
against it means nothing. And `chrome://accessibility` returns an empty dump under
`--headless=new`; it needs a real window, which can be parked off-screen with
`--window-position=-2400,-2400`.

**Order columns by what has to be read together, and put the widest opaque identifier
last.** In the invoice payment history, Reference — a 214px column of strings like
`pi_3OH7t6kSPrRuky3HQtqhtz0s` — sat in the middle and pushed the table to 933px against
798px of container at 1440px. The column it pushed off the right edge was Balance after,
the one column that exists to prove a failed attempt leaves the balance untouched. Amount
and Balance after now sit side by side, so a row reads "₦290,628 paid, ₦1,421,172 left" in
one movement, and the long string nobody scans and everybody copies is what scrolls.

**A column shows a figure only when it says something another column does not.**
Paid and Amount printed the same number at full money width on every settled invoice —
twice a row, down the whole page, reporting what the status badge had already said. Paid
now carries a figure only when part of the money has arrived, and a dash otherwise, which
turns the column into a scan for exactly the rows that need chasing: anything with a
figure in it is a partial. An overpayment shows too, in `refunded`, because paid-beyond-
the-total is an anomaly somebody has to see — the test is `paid !== amount`, not
`paid < amount`.

The saving is not only visual. Collapsing that column to a dash on most rows took the
table's min-content width from **1080px to 998px**, which is 82px less horizontal scroll
on every narrow viewport.

### Status badge

`radius-xs` · `padding 2px 8px` · `text-micro` uppercase · **3px left rule in the status
foreground** · marker glyph + 4px gap + label · `bg` = status subtle · `border` 1px =
status line (left border overridden to 3px status fg) · `color` = status fg. `void`
additionally sets `text-decoration: line-through` on the label. No hover state — badges
are not interactive.

The 3px left rule is the scannable element and is **not optional** — see §3.4. Without
it the badge column collapses to ΔE 2.0 (dark) / 0.3 (light). With the marker, it is
what makes "show me everything overdue" a glance rather than a read.

### Theme toggle

Three states — light, dark, **system** — as a segmented control, not a cycling button. A
single button that walks light → dark → system shows one icon and tells the reader
neither which state they are in nor what the next press does. Three segments make the
current state visible and any state one press away.

**`system` is an absence, not a value.** Choosing it REMOVES `data-theme` so the
`prefers-color-scheme` rule applies again. Resolving system to a literal in JavaScript and
stamping that would look identical on load and be wrong by evening: a reader whose OS
flips to dark at sunset would keep whatever we resolved that morning until they reloaded.
The media query in §3 exists to be fallen through to, and before this control shipped it
was dead code — the root layout hardcoded `data-theme="dark"`, so nothing ever matched it.

**Applied before first paint.** A preference applied by React lands after hydration, which
is after the page has painted: every navigation would flash the default theme and then
correct itself. A minimal inline script in the document head reads storage and stamps the
attribute synchronously. It is the one place in this codebase where a render-blocking
script is the right answer, and it is wrapped in `try/catch` because `localStorage`
throws rather than returning null when site data is blocked — an exception there happens
before `<body>` exists and would leave a blank page rather than an unstyled one.

Read through `useSyncExternalStore`, like the sidebar collapse (§8), so two tabs stay in
step via the `storage` event and no state is mirrored into an effect. The server snapshot
is `system`, because the server cannot read a browser's storage and must not guess.

**Placement: the shell header**, beside the account affordances — theme is a property of
the reader, like who they are signed in as. Not the sidebar foot where §8's other
persisted toggle lives: that slot is `xl:block` and the rail is hidden below 900px, so a
reader on a 1100px laptop or a phone would have no control at all. The landing page and
login carry it too — a visitor's first impression should not be locked to whichever theme
we happened to pick.

### Presence marks

A yes/no fact about configuration, not about a record's state — used by the gateway panel
in Settings for "adapter registered" and "key present".

Built like a §3.4 badge, but from the `paid` / `void` pair rather than a green/red one.
**Absent is a state, not an error.** Most installs will legitimately never wire up two of
the three gateways, and painting that in `failed` would put a permanent alarm on a page
where nothing is wrong. The `void` treatment says "not in play", which is what it means.
The explanation of what absence *costs* ("every webhook from this provider will fail
verification") goes in a `title`, so the row stays scannable.

**Never render a credential, not even masked.** A masked key is not a redaction, it is a
confirmation: `sk_live_••••4f2a` tells a reader the account is live rather than test, and
the visible characters are enough to match against a key seen elsewhere. The panel answers
"will a webhook verify today", and present/absent answers that completely. What it shows
instead is the environment variable's NAME — the actionable half, and not a secret.

`PresenceMark` in `components/ui/presence-mark.tsx` is the one implementation. It lived
inside the settings page until the Alerts panel needed the same mark for
`TELEGRAM_BOT_TOKEN`; a pattern this section names should not be re-typed per caller. It is
hook-free, so a server panel and a client form can both use it.

Use it wherever a panel's own fields are insufficient without an environment fact. The
Alerts panel is the case that proved the point: chat id and toggles can all be filled in
correctly and still send nothing, because the dispatcher skips silently when the token is
missing — right for a cron, useless for a person reading the form.

The check is `typeof value === 'string' && value.trim() !== ''`, not `!== undefined`: an
env var set to an empty string is the most common way a deploy looks configured and is not.
Verified by comparing every environment secret of 8+ characters against the rendered HTML —
no value appears, and nothing renders as a run of bullets.

### Row-state marks

Two marks say something about a row that is not one of the seven status states, so they are
not `StatusBadge` and must not be built from its tokens by hand:

- **`ArchivedMark`** (`clients-table.tsx`) — a client who is archived.
- **`UnmatchedMark`** (`payments/payment-bits.tsx`) — money no invoice claims.

Both follow §3.4's badge construction, and both exist for the same reason: the cell would
otherwise be empty, and an empty cell reads as *missing data* — something that will fill
itself in — rather than as a complete record with work outstanding.

`UnmatchedMark` takes the `pending` token, not `failed`. Nothing has gone wrong: the money
arrived and is waiting to be placed. `failed` would put a payment that succeeded into the
same colour as one that was declined.

**A state that needs action must be visible without filtering for it.** The payments list
shows the mark on every unmatched row *and* leads with a count above the table, because a
number you only see after filtering is a number nobody sees. The banner is absent, not
zeroed, when the queue is empty — a standing "0 unmatched" is furniture people stop reading.

### Button

| Variant | Default | Hover | Active | Focus-visible | Disabled | Loading |
| --- | --- | --- | --- | --- | --- | --- |
| **Primary** | `accent` fill, `accent-fg` text | `accent-hover` | `accent-active`, `translateY(0.5px)` | `--ring-focus-inverse` | 40% opacity, `not-allowed`, no hover | Spinner replaces label; **width held** |
| **Secondary** | `bg-raised`, 1px `line-strong`, `fg-primary` | `bg-overlay`, border `fg-muted` | `bg-inset` | `--ring-focus` | 40% opacity | as above |
| **Ghost** | transparent, `fg-secondary` | `bg-raised`, `fg-primary` | `bg-inset` | `--ring-focus` | 40% opacity | as above |
| **Destructive** | transparent, 1px `failed-line`, `failed` text | `failed-bg` ground | `failed-bg`, border `failed` | `--ring-focus` with `failed` in place of accent | 40% opacity | as above |

Heights come from the control scale above — `h-control-sm` / `h-control` / `h-control-lg`,
which is 44 / 44 / 48px below `md` and 32 / 36 / 40px at `md`+. Never write `h-8`/`h-9` on a
button. `radius-sm`, `text-small` weight 500, padding `0 14px`, icon gap 6px.

An icon-only button also needs `min-w-control*` or `size-control*`; height alone leaves a
44×28 target, which fails the rule on the axis nobody checks.

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
  `--line-strong` (the 3:1 token — required), `radius-sm`, **`h-control`** (44px at touch,
  36px at `md`+), padding `0 10px`, `text-body`, `fg-primary`. Placeholder `fg-muted`.

  A 16px font size on the input is also load-bearing at touch and is what `text-body` gives:
  iOS Safari zooms the viewport on focus for anything under 16px, and the zoom does not
  reverse on blur — the reader is left on a page 1.3× too wide with no way back but a
  pinch. `text-body` is 14px, so **inputs take `text-base` (16px) below `md`**, which is the
  one place in the app that size appears.

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

**Every empty state carries an `action` slot, and the filtered variant must fill it.**
An empty state that only describes the emptiness leaves the user to work out the way back
themselves — and on a filtered ledger the way back is a specific URL they can no longer
see, because the thing hiding their data is the thing they would have to read the query
string to find. The slot renders inline with the two lines in the filtered variant and
below the sentence in the first-run one.

Fill it with:

| Case | Action |
| --- | --- |
| Filtered empty | **Clear filters** — an inline `accent` link to the unfiltered route. Required. |
| First-run empty | The one primary action that ends the state (`New invoice`), or nothing if the surface is read-only. |

Say what is on the other side of the filter while you are at it: *"No invoices match these
filters. 47 on the books in total."* The count is what tells the user their ledger is
intact and the filter is at fault, which is the actual question behind the empty screen.

**Never call `notFound()` from inside a Suspense boundary.** Measured on the invoice
detail page: with the read wrapped in `<Suspense>`, a missing invoice returned **HTTP
200** — `not-a-uuid`, an absent uuid and a real invoice all came back 200 under curl. The
boundary lets Next flush the shell before the suspended child resolves, so by the time
`notFound()` throws, the status line has already gone out; the 404 UI renders under a 200,
which is wrong for crawlers, uptime checks and anything reading the status rather than the
pixels. Awaiting the read in the page body before the first flush returned all three to
404. A page whose own title comes from the record has no meaningful shell to stream ahead
of it anyway.

### Inline destructive controls

Not everything destructive earns a confirmation. Removing an unsaved line from an invoice
editor destroys nothing that exists yet, and a confirm on every removed row is the friction
that teaches people to click through confirmations — which is what makes the ones that
matter fail. §7's confirm-in-place is for actions that are consequential or hard to undo.

What an inline destructive control does need is to **not look like its neighbours**. Three
identical bordered buttons in a row say that moving a line and deleting one are the same
kind of act.

**Separate by structure first, colour second.** Group the positional controls into one
segmented control — a single border with a divider between them, reading as a pair — and
put the destructive one outside it across a real gap (12px), unbordered. The grouping alone
tells them apart for a reader who cannot see the colour difference, which is the same
argument §3.3 makes for badges. Colour then reinforces it: `ink-muted` at rest, quieter
than the pair, and `failed` on hover and focus.

Disable rather than hide when the action is temporarily impossible — the last remaining
line cannot be removed — and say why in a `title`. That differs from §7's rule for
*viewer* affordances, which are hidden: a control that is disabled for a reason the user
can change is worth showing; one they can never use is not.

### Filter panel

One component — `components/ui/filter-panel.tsx` — for every list: payments, invoices,
clients. Open at `md` and above, exactly as all three shipped. **Collapsed below it, with
whatever is applied named in the closed row.**

Measured at 390×844: the payments form ran **484px, 57% of a screen**, between the page
header and the first payment — search, currency, two date pickers, four status checkboxes,
four provider checkboxes, an "only unmatched" toggle and Apply, all open, all with **12×12px**
checkboxes. `/invoices` was 472px of the same. Collapsed, the row is **78px**.

**Collapsed does not mean inactive.** The fields stay in the DOM at `display: none`, so an
applied filter keeps submitting while the panel is shut. That is what makes the summary
load-bearing rather than decorative: the reader must be able to see what is filtering their
list without opening anything, or a collapsed panel becomes a place for state to hide. Each
list passes `summary` as one short phrase per applied filter — `"sabi" · Awaiting a match ·
2 statuses · NGN`. Counts rather than lists for multi-selects: "2 statuses" fits a 340px row
and the status names do not.

**It is a client component, and `<details>` cannot do this job.** `open` is a single DOM
attribute, so it cannot be false below `md` and true above it, and the trick `DeskSection`
uses — render the children twice — is unavailable here, because duplicating form fields
would duplicate their `name`s and submit every filter twice. So the state is real and the
breakpoint moves the panel's class: `hidden md:flex` when closed, `flex` when open, with the
toggle rendered `md:hidden`. `aria-expanded` + `aria-controls` on a real button rather than
the checkbox-hack that would have kept it server-rendered — a checkbox announces itself as a
checkbox, and this is a disclosure.

Apply and Clear all live in the panel rather than at each call site, so all three lists get
the same controls at the same `h-control`.

### Ranked choice lists — the match panel

The pattern for "here are the options, ordered, pick one". Currently one instance: placing
an unmatched payment against an invoice.

**A correct sort order is invisible if every row looks the same.** Measured at 390×844:
twenty candidates, each 113px, **zero gap**, and **fifteen of the twenty read "Already
settled in full"**. The query's ranking — same client, then amount proximity, then recency —
was sound and unreadable, because position alone cannot carry an ordering whose basis the
reader cannot see.

Three rules, in the order they matter:

1. **Split by whether the option can do the job, before ranking within it.** Invoices with
   something outstanding are the list; fully-settled ones go behind a disclosure. Same-client
   sorts first in SQL and it sorts *settled* same-client invoices first too, so the strongest
   ranking signal was burying the answer. Splitting is not a re-ranking — the query's order
   is untouched inside each group.
2. **Draw the signals the rank is made of.** `Settles exactly` when the amount gap is zero,
   `Same client` when the invoice belongs to whoever is on the payment. A row carrying both
   is the answer and says *why*, rather than relying on being first. `Same client` was
   previously a muted `· already on this payment` suffix — the strongest signal in the query
   rendered as the quietest thing on the row.
3. **The disclosure has to say what opening it would mean.** "10 already settled in full /
   Matching one records an overpayment". A bare count cannot tell a reader whether those are
   options or noise.

**The rare-but-real case is demoted, never removed.** A duplicate transfer has to go
somewhere; `getMatchCandidates` returns settled invoices deliberately and `ConfirmMatch`
spells out the overpayment. Demoting the rare case is what lets the ordinary one be read.

**Not capped by count.** Nine open candidates render in full at 390px. Capping a decision
list would hide a valid target, which is different from the dashboard's overdue list, where
the cap defers to a page built for reading all of them. A list you are choosing *from* shows
its choices; a list you are glancing *at* may show its worst three.

Applied at every width, not below `md` only — the argument is about legibility of rank, and
it is as true at 1440px.

### Destructive and irreversible actions

**Confirm in place, not in a modal.** §7 gives modals to things that need focus trapping
and an escape path; a two-button row needs neither. The control replaces itself with a
sentence saying what will happen and a confirm/cancel pair, in the space it already
occupied — so nothing jumps and the question is asked where the answer will be given.

Two transitions earn it on an invoice: **void**, which is not reversible from the UI at
all, and **mark as sent**, which is what makes an invoice uneditable. Neither should be one
stray tap away on a phone.

**In a header action cluster, the confirmation replaces the controls.** Confirm-in-place
cannot mean "append a prompt beside three buttons" there — that reflows the header and
pushes the page down. The whole group swaps for the question and swaps back on cancel, so
the header keeps its height and the answer is given where the question was asked.

**Close the panel when the action succeeds.** A form action revalidates and the server
re-renders the page, but a client component's own state survives that: without an explicit
reset the confirmation stayed on screen after the invoice had already been sent, offering
to send it again. The re-render changes the page; something has to put the control back.

**One prompt per act, not one per control.** Voiding a draft and voiding a sent invoice run
the same action and are not the same act — one cancels something nobody has seen, the other
cancels a document already in someone's inbox that this app cannot recall. The prompt says
which: *"This draft has not been sent, so voiding it costs nothing"* against *"the client
has a copy of it… voiding does not tell them, so send a note or a credit note as well."*
A single generic sentence covering both is the same failure as "are you sure".

**Say what happens, not "are you sure".** *"Once sent, this invoice can no longer be
edited — the client has a copy of it"* is the sentence; the button then says
*"Yes, mark as sent"* rather than *"OK"*, so the confirm reads as the action even out of
context.

**Write controls are hidden from a read-only viewer, never disabled.** A greyed-out Void
button advertises a capability the reader does not have and invites them to ask why it
does not work. Absence says nothing, which is correct — they have nothing to act on. This
is presentation only; every action calls `assertCanWrite()` on the server first, before
validation and before any read.

**Every mutation is a POST.** The session cookie is `sameSite: 'lax'`, which means a
cross-site GET carries it — so `<a href="/invoices/123/void">` would be a working CSRF
endpoint with a nice hover state. `lax` does not send the cookie on a cross-site POST,
which is what makes a form safe and a link not. Edit is a link precisely because it only
navigates.

### Select

**A select carries `bg-overlay`; a text input does not.** That is not a style preference —
the native popup is drawn by the OS from the `<select>` and its `<option>`s, and nothing
else on the page reaches it.

Measured on `/invoices/new` before the fix, with thirteen client names illegible in the
popup: root `color-scheme` **dark**, select `color-scheme` **dark** (inherited, already
correct), option colour `rgb(235,239,244)` — and option background **`rgba(0,0,0,0)`**.
Near-white text on no background, so the OS painted its own light ground beneath it.
Setting `color-scheme: dark` on the element, the usual advice, changed nothing measurable
because it was already dark. The missing thing was a background.

```css
select,
option {
  background-color: var(--bg-overlay);
  color: var(--fg-primary);
}
```

Both, not just `select`: the popup paints each row from its own option, so a list
background alone leaves the rows unstyled. Tokens rather than literals, so it follows the
theme instead of pinning the popup dark in a light app. `--bg-overlay` is §6's surface for
popovers and dropdowns, which is what this is.

**Never put `bg-transparent` on a select.** A utility beats `@layer base`, so it takes the
popup's ground away again. Give inputs and selects separate class strings rather than one
shared `field` — a select that opens a surface and an input that is a well are different
controls, and the difference has consequences.

Verified: option ground `rgb(29,36,46)` with text at **13.53:1**, in both OS colour
schemes, on the invoice form and the list's filter bar. **Not verified: the popup itself.**
It is an OS-level window that a headless screenshot does not capture, so the rendering
needs one look on a real machine.

### Form fields

Inputs follow §7's text-input spec. Two rules that only surface once a form can fail:

**Control every field, including the ones that appear not to need it.** React 19 resets an
*uncontrolled* field after a form action completes. Measured on the invoice form: submit
with one bad unit price, and the line items — controlled — kept their values while the
client, both dates and the description came back blank. The user fixes the one field the
error names and silently loses four they never touched. `defaultValue` is the trap: it is
the natural thing to write, and it is exactly what empties on a failed submit.

**Group a money field as it is typed.** `6700000` in a unit-price field is ambiguous until
something else resolves it, which in a finance tool is a factor-of-ten error waiting to
happen; `6,700,000` is legible at a glance. This is only safe because the parser strips
grouping separators before it reads the number, so the field's value, the value the form
posts, the browser's running total and the server's stored total are all the same string
through the same parser. **Never add formatting the parser does not already accept.**

Grouping has to move the caret itself. Inserting a separator to the left of the caret
pushes the text right while the caret keeps its old index, so it walks backwards through
the number as you type — `6,70|0,000`. Count the significant characters before the caret
and find that count again in the reformatted string.

**A money field is `inputMode="decimal"`, never `type="number"`.** A number input accepts
exponent notation and lets the browser round, which is precisely the precision this ledger
refuses to hand off. Parse the string yourself and reject what the currency cannot hold —
`1.005` in a two-decimal currency is an error, not something to round away. A user who
typed it meant something, and choosing one of the two neighbouring kobo for them is how a
total ends up one off the sum of its lines.

**A live total must be computed by the same code as the stored one.** The invoice editor
shows a running total while the user types and the server recomputes it on submit; the two
call the same `multiplyByQuantity` and `parseDecimalToMinor` from `@/lib/money`, on the
same strings. That is not belt and braces — the deferred trigger rejects any write where
the lines disagree with the total, so a client that rounded differently produces a form
that fails on submit with an error about a sum the user cannot see and did not cause.
Sharing the functions makes agreement structural; re-implementing the arithmetic, even
correctly, makes it a coincidence that holds until someone changes a rounding rule on one
side.

### Skeleton

`bg-raised` blocks at `radius-xs`, matching the real content's box exactly. Shimmer is a
translating linear-gradient, 1.4s linear infinite, `--line-subtle` → `--bg-overlay` →
`--line-subtle`. Under `prefers-reduced-motion` the shimmer is removed entirely,
leaving a static block — no pulse. Table skeletons render the real row height and column
widths so nothing shifts on load.

### Pagination

`Pagination` from `@/components/ui/pagination`. **`basePath` and `label` are required
props**, and deliberately have no defaults.

It began as `InvoicesPagination` with `/invoices` written into every href and
`aria-label="Invoice pages"` written into the nav. The clients list then imported it,
which put a latent bug in the tree: with more than 25 clients, page 2 would have navigated
into the invoice ledger carrying the client list's filters. Nothing surfaced it because
fourteen clients fit on one page, and the current page renders as a `<span>` rather than a
link — so the wrong href existed and was simply never drawn. The `aria-label` had no such
threshold and had been announcing "Invoice pages" on the clients list since it shipped.

A default for `basePath` would have preserved exactly that: the third list to forget the
prop inherits the first list's route. Required props make the omission a build error.

32px targets, `text-small`, `money` utility for the numbers. Current page marked with a
2px copper underline — the ledger rule again, not a filled pill. Prev/next are ghost
buttons; disabled at the ends. Row-count select on the left, `Showing 1–50 of 247` in
`text-small` / `fg-muted` centred, controls right. Server-side pagination — do not fetch
the full ledger.

---

## 8. Layout

**Sidebar** 248px expanded, 60px collapsed to an icon rail, **at and above 900px only**.
Manual toggle persisted to `localStorage`; auto-collapses below 1280px. `bg-raised`, 1px
`line-default` right edge. Active item: `accent-subtle` ground + 2px `accent` left rule +
`fg-primary` label. Collapsed rail shows tooltips on hover.

**Below 900px: a bottom tab bar.** Not a drawer — see below.

### Navigation below 900px is a bottom tab bar

Five destinations — Dashboard, Invoices, Payments, Clients, Settings — in a `grid-cols-5`
bar fixed to the bottom edge. 56px tall plus `env(safe-area-inset-bottom)`, a 20px glyph
over an 11px label, `bg-raised` with a 1px `line` top rule. Active cell takes
`accent-subtle` ground and a 2px `accent` **top** rule — the rail's left rule turned ninety
degrees onto the bar it sits in, drawn with an inset shadow so activating a cell does not
change its height.

**This section previously specified an overlay drawer, and the shell shipped a horizontal
top strip instead. Both are now superseded; neither is outstanding work.**

#### What the strip measured

| | |
| --- | --- |
| Items needed | **501px** (509px at 360px, where the mark is one letter) |
| Scrollport given | **354px** at 390px |
| Hidden at rest | **147px — 29% of the primary navigation** |
| Permanently past the fold | **Clients, Settings** |

On every authenticated page, at every scroll position, behind an `overflow-x: auto`
scroller with nothing announcing it. The keyboard-focus correction that used to live in
`sidebar.tsx` — restoring `scrollLeft` when Tab parked a partly-clipped item under the
edge — existed only to service that overflow, and was deleted with it.

#### Why a tab bar and not the drawer

Five destinations fit a tab bar exactly: 390 ÷ 5 = **78px per cell** against a 44px
minimum, and 64px per cell even at a 320px floor. Nothing scrolls and nothing is hidden.

A drawer costs a trigger, a tap, an overlay, a focus trap and an escape key to show five
items that already fit on one bar — and it would put every destination one interaction
further away than the strip it replaced, on the surface where navigation was already the
worst-measuring thing in the product.

#### Why the bottom, and what it recovers

A phone is held at the bottom, but the structural argument is better than the ergonomic
one: **a bar pinned to the bottom covers the end of the scrollport rather than the start.**

So `--sticky-top` drops to `0` below 900px. The 49px of top strip is recovered twice over —
once as viewport height, and again because every ledger column header that was offset
beneath it returns to y=0. The cost moves to `padding-bottom` on `<main>`, which scrolls
with the content instead of occupying the top of every screen.

| Viewport | Chrome above content | Chrome below | Usable | |
| --- | --- | --- | --- | --- |
| 390×844, before | 49px strip (pinned) | — | 795px | 94% |
| 390×844, after | **0** | 57px tab bar | 787px | 93% |

Near-identical totals, and that is the point: the same pixels now sit where they do not
push the page's first line down, and the reader's thumb is on them.

#### Consequences the shell has to carry

- **`viewportFit: 'cover'`** in the root `viewport` export, or `env(safe-area-inset-bottom)`
  reports 0px and the bar floats above the home indicator.
- **`padding-bottom: var(--app-tabbar-total)` on `<main>`**, collapsing to 0 at 900px. The
  bar is `fixed` and out of flow; without it the last ledger row sits underneath.
- **The home mark moved to the shell header** below 900px. A sixth cell would cost every tab
  13px to duplicate a destination the Dashboard tab already reaches — but the mark is also
  the only route back to `/` for an anonymous reader in the demo, which no tab goes to.
- **The account readout (`email · ROLE`) is hidden below `md`.** Measured at 390px with it
  shown, the header wanted 577px of a 390px viewport and pushed the document into a 32%
  horizontal overflow, which stretched the tab grid to 115px cells. The touch scale is what
  made it unaffordable: the theme toggle alone is three 44px segments, 136px of a 342px
  content box. The readout is the only member of that header that is not a control, and
  Settings answers the same question.

**Content max-width** 1600px for data pages with 24px gutters (32px at ≥1280px) — the
ledger wants width. Forms and settings constrained to **720px** regardless of viewport;
a 1600px-wide form is unusable. Marketing 1200px, prose 68ch.

The marketing measure has a utility: **`marketing-container`** — 1200px, centred, with
24px gutters widening to 40px at ≥768px. It carries width, centring and horizontal
padding only; vertical rhythm stays at the call site, because a masthead, a section and
a footer want different amounts of it and folding one in would make the other two fight
the utility. It exists because the landing page had written
`mx-auto max-w-[1200px] px-6 md:px-10` by hand at seven call sites, which is seven
chances for one of them to drift off the measure the rest of the segment shares.

**Page header** Optional breadcrumb (`text-micro`, `fg-muted`), title `text-h2`,
optional description `text-small` / `fg-secondary`, action cluster right-aligned.
20px vertical padding, 1px `line-subtle` bottom rule. On table pages it sticks and
compacts 72px → 52px on scroll, dropping the description.

**Breadcrumb and title both take a node, not a string.** A breadcrumb that cannot be a
link is not a breadcrumb, and it had only ever been used for a static label — the invoice
detail page is the first caller that needed it to navigate. The title took a node for the
same reason: an invoice number is the title of its own page and §7 puts invoice numbers in
Plex Mono, so the caller wraps it in `money`. The alternative was a `mono` boolean on the
component or a `<style>` override at the call site, and the face of one page's title is
not the shared component's business.

**Returning from a detail page returns to the list you left.** The list's row links carry
the current query string as `?back=<encoded>`, and the detail breadcrumb decodes it —
so a reader who filtered to overdue, sorted by amount and opened row four lands back on
that view rather than on an unfiltered page 1 they have to rebuild.

Not the `Referer` header: client-side navigation does not set it, a cross-origin arrival
strips it under the default referrer policy, and a back link that remembers *sometimes* is
worse than one that never claimed to. The param is explicit, survives a refresh and a
bookmark, and is re-parsed against a whitelist of the list's own keys before it reaches an
href, so a crafted link cannot smuggle anything through it. Name the carrier for what it
is — `back`, never `from`, which is already the list's issued-from date filter.

**Narrow screens: horizontal scroll with a sticky first column — down to `md`, then
stacked entries.** A ledger is read by comparison — is this amount larger than that one,
are these three all overdue. Card-stacking destroys column alignment, which destroys the
tabular figures that are the entire typographic premise, and turns a 50-row scan into 50
screens of scrolling.

**That argument holds exactly as long as there is a column to compare down, and no
longer.** Measured on the invoice table, which has eight columns and two pins:

| viewport | container | columns actually readable |
| --- | --- | --- |
| 360px | 295px | Invoice, Amount — the two pins, nothing between them |
| 390px | 325px | Invoice, Amount |
| 430px | 365px | Invoice, Client, Amount |
| 560px | 495px | Invoice, Client, Amount — Status sits *under* the Amount pin |
| 768px | 703px | Invoice, Client, Status, Amount |

At 360px the two pins want 297px of a 295px container: the scrolling middle is zero pixels
wide, the client name is not clipped but absent, and the scroll cue — inset by the pin
width — lands on top of the pinned invoice number and dims it, because there is nothing
else left for it to sit over. Comparison down a column is not what is being lost there;
it has already been lost, along with the column. Horizontal scroll preserves the table. Card-stacking is correct for feeds; this is not a
feed.

**Pin both ends: identity on the left, the headline figure on the right.** One pinned
column is not enough. Measured on the invoice ledger, the table's own min-content width is
1080px — Invoice 150 · Client 185 · Status 118 · Issued 124 · Due 124 · Days over 94 ·
Paid 139 · Amount 147 — while the scroll container gets 1127px at a 1440px viewport and
967px at 1280px. The columns are not overallocated; at 1440px every one already carries
20-50px of slack over its content. So at 1280px the table overflows by 117px, and because
Amount is last in document order the 117px that falls off the right edge is exactly the
amount: the reader sees `₦2,445,000.` and has to scroll to learn what the invoice is
worth.

No width tuning fixes that — 1080px of min-content will always exceed some viewport. Only
anchoring does. Pin the column carrying the row's identity to the left and the column
carrying its headline figure to the right; everything else scrolls between them. Verified
at 1920 / 1440 / 1280 / 1100 / 900 / 768 / 560 / 400 / 360px: the amount is fully inside
the visible container at every one, and stays there mid-scroll.

Both pinned cells need their own opaque ground, or scrolled content shows through, and
both must repeat the row hover so the row still reads as one object. Give the right-hand
pin a `line` left border so it reads as an anchored edge rather than a floating overlay.

**The lower bound on pinning both ends, stated.** Two pins cost their combined width, and
the columns between them need their own. The four columns a ledger row cannot do without —
identity, counterparty, state, amount — need 150 + 185 + 118 + 147 = **600px of table**,
so roughly **650px of viewport** once the shell's gutters are taken out. Below that, one of
the four is always underneath a pin.

So: **pin both ends at `md` (768px) and above; below `md`, stop rendering a table.** 768 is
the first standard breakpoint that clears 650 with room to spare, and it is where the
sidebar has already collapsed to a strip. Do not tune the pins to fit a phone — 297px of
pin in a 295px container is not a rounding problem, and the earlier note here about a
"300px floor with 2px of overlap" understated it: the pattern stops working around 650px,
not 300px.

**Below `md`: stacked entries, not a broken table and not floating cards.** One bordered
container, entries separated by the same `line-subtle` hairline the table uses, no zebra
and no per-entry shadow — §6 spends elevation on genuine layers, and twenty-five shadowed
cards would be twenty-five objects where the ledger is one. Each entry is a link to the
detail page and carries, in three lines: the number in Plex Mono with the status badge
opposite; the client name, which is the one line allowed to wrap; and the date or overdue
count with the amount flush right.

**The tabular-figure premise is preserved, not abandoned.** Every entry is the same width
and the amount sits against the same right padding, so the amounts still form one aligned
column of tabular figures down the page — verified at 360, 390, 430 and 560px, where all
25 amounts share a single right edge in IBM Plex Mono with `tabular-nums`. That is more
alignment than the table achieves at 360px, where the amount column can only be reached by
scrolling and cannot be compared with the row above it at all.

Sorting moves with the layout: the table sorts from its column headers, and the stacked
view gets a compact sort bar carrying the same keys and the same 2px copper underline on
the active one, so the two layouts say "sorted by this" the same way. A list that cannot
be reordered on a phone is a different product, not a smaller one.

**This applies to every table, not only the ledger list.** The invoice detail page carries
two more, and both failed the same way below `md`: line items lost UNIT and LINE TOTAL,
rendering figures cut mid-number (`₦2,`, `₦1,0`), and payment history kept only DATE and
PROVIDER — so the failed-then-retried sequence the view exists to demonstrate was invisible
on a phone. Both now stack below `md` on the same rules: one hairline-separated container,
no per-entry shadows, and the figure that matters flush to a shared right edge in Plex Mono
with tabular figures.

What each stack leads with is the field a reader came for, and what it demotes is the field
that is longest and least scanned:

| Table | Stacked as | Demoted |
| --- | --- | --- |
| Line items | position · description, then `qty × unit` with the **line total** right | the workings |
| Payment history | date · status, provider · **amount**, **balance after**, reference last | the provider reference |

**A failed payment must keep both of its signals when it stacks** — the struck-through
amount and a balance identical to the entry above it. The strike says the attempt did not
count; the repeated balance proves it. Losing either turns the view back into a list of
dates.

**Omit a figure that repeats one already in the entry.** At quantity 1 the workings read
`1 × ₦1,021,352.00` beside a line total of `₦1,021,352.00` — the §7 rule again, and not
academic: that duplicate was the longest string in the entry and at 360px it overflowed by
19px, dragging the total off the shared right edge. Where a subordinate figure can still be
too wide, it is the one that truncates; the total never does.

**A money cell that can grow gets `min-w-0`, never `shrink-0`.** The clients list's stacked
entry pins one converted total with the exact per-currency figures beneath it, and that
second line is as long as the client has currencies: `€2,700.00 · £2,450.00 · ₦1,021,750.00`
measures 350px against a 344px content edge at 360px. With `shrink-0` the cell sits at
max-content, runs past the card's padding, and the list's own `overflow-hidden` clips the
overflow **silently** — no horizontal scrollbar, no visible truncation, just a figure that
stops. `min-w-0` lets the cell take the width it is given and the breakdown wraps onto a
second right-aligned line, which keeps the shared right edge. `shrink-0` is right for a
figure with a bounded width and wrong for any cell whose content is a list.

**The scroll cue.** A clipped column at the container edge is ambiguous: a clean vertical
cut reads as the end of the table just as easily as the edge of the window, and at 560px
the invoice ledger cuts through the middle of a date. The cue is a **28px fade to the
surface ground at the right edge, shown only while there is more table to the right of
it**. Content that continues fades; content that ends does not.

**Right edge only, and inset past any right-hand pin.** A pinned first column is itself
the signal that the left is anchored rather than lost, and a fade laid over it would erase
the invoice number — the one value that identifies the row. The same argument applies at
the other end once Amount is pinned there: `ScrollCue` measures any `[data-pinned-end]`
cell and offsets the fade by its width, so the cue sits in the scrolling middle where the
hidden content actually is. Measure with `ceil`, not `round` — a fractional column width
rounded down leaves the fade overlapping the pin by a sub-pixel sliver.

Use the **`ScrollCue`** component, which owns the scroll container and the overlay:

```tsx
<ScrollCue className="rounded-md border border-line bg-surface">
  <table className="min-w-[900px]">…</table>
</ScrollCue>
```

It measures `scrollWidth`, `clientWidth` and `scrollLeft` and toggles `data-visible` on a
`scroll-cue-edge` span, with a `ResizeObserver` on both the container and its child so a
viewport resize, a font swap or a filter that changes the column widths all re-measure.
Scroll position is read through `useSyncExternalStore`, not mirrored into state from an
effect. The server snapshot is "no cue", so the first paint carries none and the client
corrects after hydration — a cue rendered before anything has been measured would be a
guess.

**The pure-CSS version does not work, and it is worth recording why**, because it is the
answer everyone reaches for. Two `background-attachment: local` covers over two `scroll`
shadows: the covers travel with the content and mask the shadow at whichever end is fully
scrolled, no listener, always exactly as true as the scroll position. Painting the four
layers in flat colours and reading the pixels back at 560px in Chrome 141:

| Layer | Anchored | Rendered |
| --- | --- | --- |
| left cover (`local`) | `left center` | correct, 28px at the visible left edge |
| left shadow (`scroll`) | `left center` | correct, 20px, exposed once scrolled |
| right cover (`local`) | `right center` | correct, arrives at the right edge when scrolled |
| **right shadow (`scroll`)** | `right center` | **1px** — placed 19px past the visible right edge |

A `scroll`-attachment layer on a horizontally scrolling element takes a positioning area
wider than the box it is painted into, so `right center` lands off-screen. The cue
survived only on the edge that already has a pinned column. Measure before shipping a
mechanism that looks obviously correct.

The public demo dashboard is the exception: its summary cards stack normally, since they
are cards already rather than a table.

**Below 900px the sidebar becomes a bottom tab bar** — see "Navigation below 900px is a
bottom tab bar" earlier in this section for the specification and the measurements.

**This corrects an earlier rule.** The text here used to defend a horizontal scrolling
strip on the grounds that a drawer "would introduce a mode to reach five links that fit on
one line", and set its own trigger to revisit: *when the nav outgrows one line at 360px.*

That trigger had already fired when the rule was written. The five items needed **509px at
360px** and 501px at 390px, against a 354px scrollport — 29% of the navigation was off the
right edge at rest, permanently, and the keyboard-focus correction in `sidebar.tsx` existed
solely to service that overflow. The argument against the drawer was sound and still is;
the premise that the strip fit was never true, and one line was the wrong line. The tab bar
keeps the drawer's rejection and fixes the premise.

### The dashboard on a phone: three tiers, not six blocks

The stacked-entry work fixed legibility and left the page **4096px — 4.85 viewports of
blocks at equal weight**: five identical KPI tiles, a chart, an overdue list, a provider
breakdown, a fifteen-event feed and an unmatched queue, each bordered, each the same width,
none louder than any other. A desk page rendered small.

**What a phone reader wants from this page**, in order: *what am I owed, what needs action,
how are things going.* Everything below follows from ranking against that.

#### Block inventory

| Block | Before | After | Decision |
| --- | --- | --- | --- |
| KPI row | 604px | **367px** | Restructured into three tiers |
| Overdue invoices | 899px | **475px** | Capped at 3 entries + a route to the rest |
| Unmatched payments | 775px | **550px** | Kept whole — it is the to-do list |
| Revenue chart | 360px | **360px** | Kept, axis labels fixed |
| Activity feed | ~600px | **74px** | Disclosure, latest event in the summary |
| Provider breakdown | ~460px | **74px** | Disclosure, leader in the summary |
| **Total** | **4096px / 4.85vh** | **2315px / 2.74vh** | |

#### The KPI row becomes three tiers

Outstanding is the hero — `text-h2`, alone in its box. Overdue and unmatched become **alert
rows that are also links** to the sections listing them, because a count is a prompt and the
reader's next move after reading "7 overdue" is always to go and look; on a phone that was a
900px scroll past a chart. Total revenue and this month drop to an unboxed `text-small` pair
under a hairline: §6 spends a border on "this is a separate object", and context is a
footnote to the figure above it, not two more objects competing with it.

#### What gets demoted, and why each

**Provider breakdown → disclosure.** Which gateway brought what over six months is
reference. It settles no question a reader has standing up, and it was sitting above the one
block that is a to-do list.

**Activity feed → disclosure.** A log answers "what happened", which is browsing, not
deciding — and the three questions above are answered by the tiers, the two action lists and
the chart. It was the second-largest block and the only one that decided nothing.

**Neither is cut, and neither collapses to a bare count.** The rule is that nothing a reader
would go looking for may be hidden — a disclosure is ranking, not hiding, but only if the
closed row says enough to judge whether opening it is worth a tap. So the feed names its
most recent event ("15 events · latest 16 Sept, 08:23"), which preserves the one live signal
it carries: that money moved a minute ago. The provider row names the leader and its total.

**The overdue list caps at three** with "See all 7 overdue invoices" → `/invoices?status=overdue`.
The query sorts worst-first, so three answers "how bad is it", and the full count is stated
twice before the link — once in the alert row, once in the section header.

`DeskSection` implements the pattern. It renders its children twice, into a `<details>` that
exists only below `md` and a `<section>` that exists only above it, because `<details>` has
no CSS-only "always open" state: `::details-content` expresses it exactly and has no Firefox
support, and forcing `display` on the children does not work because the UA hides them
through the slot. The alternative was JavaScript to express a media query.

#### Reading order is action-first, at every width

The chart used to sit second, between the figures and the two lists of things to do — a desk
order, where at 1600px the overdue table is on screen beside it anyway. The order is now
KPI → overdue → unmatched → chart → feed/providers.

**Changed in the DOM rather than with CSS `order`.** `order` moves boxes and leaves the
document alone, so a screen reader and the Tab key would still traverse the desk order while
the page showed another — two reading orders for one page. Action before analysis is
defensible at 1600px too, which is what makes a single order possible.

#### Chart axis labels: measured, not assumed

At 390px the plot area is 244px and six `MMM YY` labels are 40px each — **240px of label in
244px of room**, so `Apr 26` and `May 26` rendered 0px apart and overlapped by 2px at each
boundary. They were touching.

The fix is `MMM` alone, which takes the run to ~150px, **except at the first tick and at
every January**. Dropping the year unconditionally is wrong on a finance chart: a six-month
window can straddle a year end and `Dec` beside `Jan` is genuinely ambiguous. The first tick
anchors the axis and January names the year it starts. Applied at every width rather than
below `md` — the chart is a client component, so a width-conditional formatter would have to
read the viewport in JavaScript, and the short form is better at 1440px too.

### Navigation is pinned, and `--sticky-top` is the contract

All three navigation surfaces stay put on scroll: the **tab bar** below 900px, the rail at
and above it, and the marketing masthead at every width. Before this, all three scrolled
away.
The rail's failure was the quiet one — it *looked* anchored, because `align-items: stretch`
gave it the document's height and it painted its ground the whole way down, but measured at
1440×900 scrolled to y=700 it was `position: static` with its top 700px above the viewport.
A sticky box as tall as its own containing block can never move relative to it, so
**`self-start` is load-bearing** on the rail: shrink it to its own height, then pin it.

**`--sticky-top` answers one question: how much chrome is pinned above me right now.**
Everything that needs clearance reads it rather than re-deriving it.

| Context | `--sticky-top` | Why |
| --- | --- | --- |
| app shell, <900px | `0` | navigation is the **bottom** tab bar; nothing is pinned above content |
| app shell, ≥900px | `0` | navigation is the vertical rail; nothing is pinned above content |
| marketing segment | `76px` (`--masthead-h`), `56px` under `max-height: 480px` | set on the segment wrapper |

The app shell is now zero at every width, and the token still earns its keep for two
reasons: it **inherits**, so the marketing segment overrides it on its own wrapper and
every descendant follows without knowing what the app shell does; and the ledger headers
and focus clearance read one name rather than each re-deriving "is anything above me".
Hard-coding `top-0` in the app would be correct today and wrong the first time any
surface pins something again.

`--app-nav-h` is gone with the strip. The bar's own height is **`--app-tabbar-h`** (56px),
and **`--app-tabbar-total`** folds in `env(safe-area-inset-bottom)` so the shell has one
number to pad with whether or not the device has a home indicator. Neither feeds
`--sticky-top`; a bar at the bottom pins nothing above anything.

It is a **variable rather than a constant because it inherits**. The marketing segment sets
its own on its wrapper and every descendant follows, so nothing in that subtree needs to
know what the app shell's strip is doing. Two consumers today: the ledger column headers
(§7) and the focus clearance below.

**Focus clearance uses `scroll-margin-top` on the targets, not `scroll-padding-top` on the
scrollport.** A sticky bar covers the top of the scrollport and the browser does not know
it: tab to a control below the fold and it scrolls to y=0, which is now underneath the nav —
the reader hears focus move and sees nothing, focus ring included. `scroll-padding-top` on
the viewport would be the tidier primitive, but the number is not a property of the
viewport; it differs per segment, and only `scroll-margin-top` inherits its way to the right
answer. The rule is `calc(var(--sticky-top) + 0.75rem)` in `:where(...)` — zero specificity,
so any component can override — and it covers `:target` too, which is the same failure
arrived at from a URL fragment instead of the Tab key.

Verified by tab-walking `/invoices`, `/demo` and `/` at 360 / 768 / 844×390 / 1440 in both
themes: **zero focus targets landing under the chrome**, tightest clearance 11.5px.

**Vertical cost.** A pinned bar is paid for in viewport height, which is scarcest on a phone
in landscape:

| Viewport | Chrome | Usable | |
| --- | --- | --- | --- |
| 360×640, app | 57px tab bar (bottom) | 583px | 91% |
| 844×390, app | 57px tab bar (bottom) | 333px | 85% |
| 844×390, landing | 56px masthead (top) | 334px | 86% |

The app's cost is unchanged in total and **moved to the bottom edge**, which is what makes
it cheaper than the number suggests: it no longer displaces the first line of the page, and
`--sticky-top` going to 0 gives every ledger column header its 49px back.

A phone in landscape is the one case where a bottom bar is worse than a top one — 333px of
usable height with the bar eating 14% of it. It is still the right trade: landscape is the
rarer orientation for this app, and the alternative costs the same pixels in portrait,
where the ledger is actually read.

The masthead's shrink is keyed to `max-height: 480px`, **not** a width query — the cost of a
sticky bar is measured in vertical space, so the condition that relieves it should be too.
That also catches a short desktop window, which a width query would miss.

**Grounds are not interchangeable between the two kinds of bar.** The app tab bar takes a
flat opaque `--bg-raised` because it sits over ledger rows and the only requirement is that the
rows do not read through it. The landing masthead takes the opposite treatment for the
opposite reason — see §2's full-ambition allowance and the `masthead-plate` utility. It sits
over four layered grounds, where an opaque bar does not read as chrome above the plate; it
reads as a seam, as though the sheet were cut at 76px and rejoined. So it is the paper at
72% over a 14px blur, with `saturate(1.35)` restoring the chroma the blur averages away, and
its bottom rule is a gradient hairline that fades out at the gutters rather than a border —
a full-bleed hairline is itself a cut line. Do not "fix" it to an opaque fill.

**Breakpoints** `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 (Tailwind
defaults), plus two app-specific thresholds: **900px** rail → bottom tab bar, **1280px**
sidebar auto-collapse. `md` (768px) carries more than a width: it is the touch boundary —
the control scale steps there (§7), and the table → stacked-entry switch happens there.

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

### The two entrance utilities

One keyframe, `settled-enter` (fade and 8px rise), exposed at two durations. Which one a
surface may use is set by §2, not by preference:

| Utility | Duration | Permitted on |
| --- | --- | --- |
| `enter` | `--duration-slow` (380ms) | Login, empty states, error pages — the moderate tier's single fade-in |
| `enter-expressive` | `--duration-expressive` (700ms) | **Landing page only** |

They are two utilities rather than one with a modifier because the choice is a property of
the surface. 700ms on a login card would be a screen announcing itself on every visit,
which is exactly what §2's moderate tier forbids; 380ms on the landing hero would undercut
the one orchestrated load that tier is built around.

**Neither is permitted on an application surface.** The dashboard and the ledger get no
entrance at all — §2 again, and the test it sets: *would this still be welcome on the four
hundredth viewing?*

Stagger a sequence with an inline `animation-delay` rather than a second utility per step:

```html
<p class="enter-expressive" style="animation-delay:200ms">
```

The reduced-motion block collapses both durations to 1ms, and `settled-enter` is declared
with `both` fill, so an element is never left parked at zero opacity waiting for something
to start it. That matters more than it sounds: an entrance built on a scroll observer
leaves a page blank for anyone whose observer never fires, whereas this one has already
finished by the time the page is interactive.

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

## 9b. Demo data: what exists is fixed, when it happened slides

Not a visual rule, but it governs every figure in every screenshot, so it belongs with
them. `buildDemoDataset()` is reproducible: the same fourteen clients, the same 59
invoices with the same numbers, amounts, currencies and line-item splits, the same payments
and reminders, and the same row ids — on every reset, forever. Only the dates move. (Ids
have moved exactly once, on 2026-09-14, when the seeded email domains became `.invalid`;
see the note below, since ids derive from the email.)

Two things track the calendar and are not composition drifting: a month name rendered into
a description (`Monthly SEO retainer, June` reads `…, April` when that invoice slides to
April — same id, same client, same amount) and `fx_rates` ids, which are keyed on the
rate's date because that table is a time series. Verified across 2026-09-12, 2027-01-01,
2028-02-29 and 2030-07-04: ids, numbers, clients, currencies, amounts, statuses, payment
references and rate values identical; every date different.

**Every seeded client is at a `.invalid` domain, and the ids changed once because of it.**
RFC 2606 reserves `.invalid` permanently: no resolver will ever answer for it and nobody
can register one, so a demo receipt or chasing letter that escapes every other guard is
undeliverable by construction rather than by configuration.

The addresses were plausible real TLDs until **2026-09-14**. That was not a theoretical
exposure — of the fourteen, `harborandfinch.com` was a registered domain with live MX
records pointed at Namecheap email forwarding, so `billing@harborandfinch.com` reached a
real person's mailbox. `cadencehealth.co.uk` resolved with an MX, and
`northbankstudios.co.uk` had an A record and no MX, which is still deliverable through the
RFC 5321 implicit-MX fallback. The receipt drain had selected 26 demo payments and the
reminder ladder sat flush against its next rung with zero headroom; only
`DEMO_EMAIL_REDIRECT` — a Resend test-domain workaround, not a safety mechanism — stood in
the way. Company names and local parts were kept exactly; only the TLD moved.

**This reset is the one deliberate exception to the stable-id guarantee above.** Client ids
are `uuidFor('client:' + email)`, so changing the domain changed all fourteen, and every id
keyed off them moved with it — invoices, line items, payments, reminders. It is a one-time
churn on **2026-09-14**, not a recurring one: the purge deletes by `is_demo` rather than by
id, so the next reset simply replaced the rows. **Ids have been stable from that reset
onward and a future difference is a bug, not this.** If you are bisecting a screenshot or a
fixture that disagrees about ids across that date, this is why.

It also closed the last path by which a seeded address could become permanently reachable.
`resolveClient` matches incoming webhooks on email and `promoteIfNeeded` flips a matched
demo client live — after which it passes the `is_demo` filters *and* survives the nightly
purge. No real gateway event can carry a `.invalid` address, so that path is now shut at
the source rather than defended against.

**The dataset has to exercise the design system, not just fill it.** A token that never
renders is a token nobody has checked. Two shapes are seeded deliberately for that reason:
most invoices carry two to four line items rather than one (a single-line invoice prints
the same figure as the line total, the invoice total and the summary total, which teaches
the reader nothing), and four invoices are part-paid with two or three succeeded payments
against them — one with a failed attempt interleaved — so the `partial` status token
renders and the payment history's running balance shows a real descending sequence with an
attempt that visibly does not move it.

**Three clients are billed in more than one currency, and one of those currencies has no
rate.** `makeInvoice` draws the currency first and then a client from that currency's pool,
so for as long as that was the only path no client could hold two currencies — which left
the entire mixed-currency treatment unrendered: the `≈` on a converted total, the exact
per-currency figures under it, and the `*` that says a currency had no rate and the total
is short. All three are §3 rules with nothing on screen to check them against.

The pairings are named in `CROSS_BILLING` rather than produced by widening the pools. A
client sitting in two pools would cover this *today* and stop the next time an earlier call
consumes one more random number, silently and in a place nobody would look. Naming them
makes the coverage a property of the dataset, and `assertCrossBilled()` fails the build if
it ever stops holding. Statuses are chosen per pairing so the second currency lands in both
Invoiced and Outstanding — a settled invoice alone would leave the Outstanding column, the
one the list leads with, single-currency for every client on the page.

EUR is deliberately absent from the seeded `fx_rates`. It is the only way `base_incomplete`
is ever true, and that flag is what stops an unconvertible amount being quietly counted at
1:1. The EUR invoice is left unpaid on purpose: settling it would have written a payment
carrying an exchange rate the app does not have. The seeder reports that balance on its own
line rather than folding it into the NGN-equivalent total, because a summary that prints
one number and omits part of the debt is the exact failure the `*` exists to prevent.

**Every provider the enum can hold has at least one payment.** `manual` had none, and
the consequence was invisible in exactly the way data-shaped gaps are: the payments filter
builds its provider list from what the ledger actually contains, so the one provider this
app writes itself — `recordManualPayment` sets it — was the one nobody could filter for.
Nothing threw, no test failed, and the list simply offered three options instead of four.
`assertEveryProviderPresent()` now fails the build if any provider drops out of the data
again.

Two of the three manual rows are instalments on an EXISTING part-paid invoice rather than
new payments, so every total, status and line-item split stayed where it was; only the
provider and the method changed. The third is cash with no reference, which is the one
pairing the others miss: hand-recorded AND unmatched at once. Their methods read the way
the manual form composes them ("Bank transfer — first instalment"), because a bare
`bank_transfer` here would be a gateway's vocabulary in a row no gateway touched.

Their references keep the seed's clock-independent `MAN-########` shape rather than the
`MAN-YYYYMMDD-XXXXXX` the live form generates. Payment ids derive from the reference, so a
reference carrying the payment's own date would slide with the calendar on every reset —
the one thing this dataset promises not to do. A demo reference that differs in shape from
a real one is the cheaper of the two costs.

**Demo and real invoices number in separate spaces.** Demo invoices are
`DEMO-2026-0001` upward; real ones are `INV-<year>-0001` upward, and the next-number
generator filters on `is_demo = false` as well as the prefix. Both sequences start at 1, so
a shared prefix would collide the moment the demo set grew past the lowest real invoice
number — `invoices.number` is unique, so that surfaces as a nightly reset failing on a
23505 rather than as bad data, but a demo that stops regenerating is still an outage.
Separate prefixes make it impossible however far either grows. Verified: with 52 demo
invoices present, the first real invoice is `INV-2026-0001`, and `DEMO-2026-0001` and
`INV-2026-0001` coexist.

Nothing downstream reads the prefix. The Paystack adapter returns whatever
`metadata.invoice_number` holds and the processor looks it up by exact equality, so
`DEMO-2026-0007`, `INV-2026-0001` and `ANYTHING-GOES-1` all pass through unchanged; the
list's search is a substring match, so it reaches both spaces. The prefix is a fact about
which sequence a number came from, not a thing to parse.

The rule that enforces determinism: **no composition decision may read the clock.** Ids
come from `uuidFor(<stable key>)` rather than `randomUUID()`, so `/invoices/<id>` survives
a reset; invoice numbers carry a constant `LEDGER_YEAR`; every invoice draws its slot in a month
(day 1-28, so one draw is valid in every month of every year) before any calendar is
consulted; and the current month is no longer scaled by how much of it has elapsed —
that scaling changed how many invoices *existed*, which is why a seed on the 8th produced
89 line items and one on the 9th produced 87.

The consequence to know about: **invoice numbers are identity, not sequence.** Paid
invoices are anchored to calendar months so the six-month revenue window always ends in
the current month; overdue ones are anchored to today so five days overdue stays five days
overdue. Those two families slide against each other through the month, so a fixed
numbering cannot also be in perfect date order. Measured across fourteen dates from 2026
to 2030: 7 or 8 of 47 adjacent pairs sit out of date order, by at most ~15 days. Every
list shows the issue date, and sorts by it by default.

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

---

## Build hazards

Things the toolchain does to CSS between what is written in `globals.css` and what the
browser applies. Each one here cost real debugging time; none of them produced an error.

### A constant exported from a `'use client'` module is not a constant on the server

Shared class strings — `FILTER_CHIP`, `FILTER_MARK` — lived in `filter-panel.tsx`, which
carries `'use client'`. The server components that import them did **not** receive the
strings. The bundler replaces a client module's exports with client *references*, and React
stringified that reference straight into the class attribute:

```html
class="function() { throw new Error(&quot;Attempted to call FILTER_CHIP() from the
server but FILTER_CHIP is on the client...&quot;) } border-line-strong"
```

Every status and provider chip on payments, invoices and clients lost its border, radius and
padding at once. **Nothing errored.** The page rendered, the checkboxes worked, and the only
symptom was that the chips went flat — which is exactly the kind of thing that survives a
visual skim.

The fix is a plain module with no directive (`ui/filter-chip.ts`), which compiles into
whichever graph imports it, so the string is a string on both sides.

**The rule:** a `'use client'` file may export components. Anything a *server* component
needs to read as a value — class strings, constants, maps, plain functions — belongs in an
undirected module. Verify by computed style, not by eye: `borderTopWidth` was `0px` before
and `1px` after, and the screenshot was the only thing that hinted at it.

### `@theme inline` tokens cannot be overridden at a breakpoint

`@theme inline` substitutes a token's **value** into every utility it generates and never
emits the variable. `text-h2` compiles to `font-size: 1.5rem`, not
`font-size: var(--text-h2)`, and `--text-h2` does not exist on `:root` at all.

That is correct for the colour tokens, which point at per-theme variables that do their own
swapping. It silently defeats any token that has to change at a breakpoint: the media query
moves a variable no rule reads, nothing errors, and the utility keeps its inlined value.

Symptom, and the check that finds it in one line:

```js
getComputedStyle(document.documentElement).getPropertyValue('--text-h2')
// ''  — inlined, so the media-query override below will do nothing
```

A plain `@theme` (no `inline`) emits `:root { --spacing-control: 44px }` **and** compiles
`h-control` to `height: var(--spacing-control)`, which a later media query can move. So
`globals.css` has two theme blocks on purpose:

- **`@theme inline`** — colours, fonts, radius, shadow, and the *fluid* type steps. A
  `clamp()` does its own scaling and needs no override.
- **`@theme`** — the control scale, the separation scale, and `--text-small`: everything
  that steps at `md`.

A related trap in the same family: **Tailwind tree-shakes theme variables it cannot see
used.** A token defined in `@theme` but referenced by no utility and no rule is simply
absent from the output, so probing `:root` for it returns `''` and looks like the bug above.
It is not — it appears as soon as something uses it.

### Vendor prefixes: the build may keep the prefixed twin and drop the standard one

**Do not hand-write a `-webkit-` (or `-moz-`, or `-ms-`) declaration next to its standard
property.** Write the standard property alone and let the build add prefixes according to
its own browser targets.

Lightning CSS — Tailwind 4's minifier, so this applies to every rule in this codebase —
reads a hand-written prefixed/unprefixed pair as redundant and collapses it to one
declaration. **It is not guaranteed to keep the standard one.** In the case that caught us
it kept the prefixed one and discarded the standard property entirely:

```css
/* written */                          /* emitted */
backdrop-filter: blur(14px);           -webkit-backdrop-filter: blur(14px);
-webkit-backdrop-filter: blur(14px);
```

On Chromium 141 that inverts support. Measured there:
`CSS.supports('backdrop-filter', 'blur(1px)')` is **true**;
`CSS.supports('-webkit-backdrop-filter', 'blur(1px)')` is **false**. So the one surviving
declaration applied to nothing, the property computed to `none`, and the landing masthead
shipped as a flat 72%-opacity wash with the hero reading through it at full contrast.

**The trap is general.** Nothing about it is specific to `backdrop-filter` — it is a
property of how the minifier collapses declaration pairs, and it can bite any property
whose prefixed form is still commonly written by hand: `backdrop-filter`, `user-select`,
`mask`, `background-clip: text`, `text-size-adjust`, `appearance`.

### A `@supports not (A or B)` guard does not catch it

The obvious defence is the wrong shape:

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  /* fallback */
}
```

This asks *"is the feature unavailable?"*, but the failure is not an unavailable feature —
it is an available feature reached through the wrong name. The standard property **is**
supported, so the `or` is true, so `not (...)` is false, and the fallback never runs. The
guard reports health while the thing it guards is dead.

Guard on the **one property you actually wrote**:

```css
@supports not (backdrop-filter: blur(1px)) { /* fallback */ }
```

Which follows from the rule above: if only one property is ever written, there is only one
thing to test, and the guard cannot drift out of step with the declaration.

### How to catch this class of bug

`@supports` tests what the browser can do; it cannot test what the build emitted. Those are
different questions and only the second one was wrong here. So verify against the served
stylesheet and the computed style, never against the source:

1. Read `getComputedStyle(el)` for the property, in a real browser, on the running app. A
   property that silently computes to its initial value (`none`, `auto`, `normal`) is the
   signature — there is no console warning for a declaration the build removed.
2. If it is wrong, read the **served** CSS, not `globals.css`, and find what was actually
   emitted for the rule.

The same two steps are what established that the ledger's sticky header has never pinned
(§7) — in both cases the source was correct and the failure was silent, and only the
computed style showed it.
