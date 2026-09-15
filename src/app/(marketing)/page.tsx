import type { Metadata } from 'next';
import Link from 'next/link';

import { getSettings } from '@/lib/queries/settings';

import { ThemeToggle } from '@/components/shell/theme-toggle';

import { CornerRosette, EngravedWave, GuillocheRosette } from './engraving';

/* ==========================================================================
   The landing page.
   ==========================================================================

   §2 puts this surface at FULL ambition — the one place layered grounds,
   guilloché line work, staggered entrance and display type above 3.5rem are
   permitted. Everything it reaches for is still the app's own identity: the
   same copper-on-ink palette, the same Newsreader and Plex pairing, the same
   status tokens. A landing page in a different palette from the product it
   links to reads as two products.

   ## Server-rendered, no client JavaScript

   Every moving part is CSS. The entrance is `animation-delay` on the existing
   `enter` utility, the plate work is SVG computed at render time, and the
   backgrounds are gradients. Nothing here hydrates, so the page costs the
   marketing segment's font payload and nothing else.

   ## The entrance

   One orchestrated load rather than scattered micro-interactions: the hero's
   parts arrive in reading order at 90ms intervals, and each section's heading
   leads its body by one beat. `--duration-expressive` (700ms) is the landing
   page's own token, applied inline because `enter` hardcodes `--duration-slow`
   and §9 has no expressive variant — see the gap note in the report.

   Reduced motion is handled globally: the media block in `globals.css` collapses
   every duration to 1ms with `!important`, which beats these inline values. The
   page then simply appears, which is correct — the entrance is decoration, and
   `both` fill means nothing is left parked at zero opacity waiting for an
   observer that does not exist.
   ========================================================================== */

export const metadata: Metadata = {
  title: 'Settled — know who has paid, and who has not',
  description:
    'Settled watches Stripe, Paystack and Flutterwave, records every payment against the right invoice, and chases the ones that never arrive. Built for freelancers and agencies in Nigeria and the UK.',
  openGraph: {
    title: 'Settled — know who has paid, and who has not',
    description:
      'Every payment matched. Every late invoice chased. Invoicing and reconciliation across Stripe, Paystack and Flutterwave.',
    type: 'website',
    siteName: 'Settled',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Settled — know who has paid, and who has not',
    description:
      'Every payment matched. Every late invoice chased. Invoicing and reconciliation across Stripe, Paystack and Flutterwave.',
  },
};

/**
 * Settings are read for the footer's business details. An hour of staleness on
 * a marketing page is free, and it keeps the ledger's own database off the
 * critical path of a first visit.
 */
export const revalidate = 3600;

/**
 * Staggered entrance, in reading order.
 *
 * Delay only — the duration comes from the `enter-expressive` utility, which
 * is where §9 says the landing page's 700ms lives. This used to set
 * `animationDuration` inline against the plain `enter` utility, which worked
 * and left the rule that governs it invisible to anyone reading the CSS.
 */
const enter = (delayMs: number) => ({ animationDelay: `${delayMs}ms` });

export default async function LandingPage() {
  const settings = await getSettings();

  return (
    <main className="relative flex-1 overflow-x-clip bg-surface">
      <Masthead />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <SeeItWorking />
      <Footer settings={settings} />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Masthead                                                                   */
/* -------------------------------------------------------------------------- */

function Masthead() {
  return (
    /*
      Pinned at every width, unlike the app shell's strip — this page has no
      second navigation to fall back to, and the two things in it ("Sign in",
      the theme control) are exactly what a reader reaches for at the point they
      have finished reading and scrolled to the bottom.

      `masthead-plate` rather than a fill: the treatment and the reason for it
      are documented on the utility in globals.css. Short version — the bar sits
      over four layers of guilloché, so it is the paper at 72% over a blur, and
      its bottom rule fades out at the gutters. An opaque bar here reads as a
      cut across the plate rather than chrome above it.

      `h-[var(--masthead-h)]` rather than padding, because the height is a
      number other things need: the marketing layout hands the same token to
      --sticky-top so every focusable in this segment clears the bar. The token
      shrinks the bar on short viewports — see the layout.

      z-30 to match the app shell's strip. The hero's own layers run to z-20.
    */
    <header className="masthead-plate sticky top-0 z-30 h-[var(--masthead-h)]">
      <div className="marketing-container flex h-full items-center justify-between">
        {/* Standard behaviour, and it was missing: a wordmark is a link home
            even on the page it points at. */}
        <Link
          href="/"
          className="enter-expressive rounded-xs font-display text-h3 text-ink md:text-h2"
          style={enter(0)}
        >
          Settled
        </Link>
        {/*
          A visitor's first impression should not be locked to whichever theme
          we happened to pick. This page is the one many readers see first, so
          the control belongs here rather than only behind a sign-in.
        */}
        <div className="enter-expressive flex items-center gap-4" style={enter(90)}>
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-xs text-small text-ink-secondary underline-offset-4 transition-colors duration-[var(--duration-fast)] ease-standard hover:text-ink hover:underline"
          >
            Sign in
          </Link>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/*
        Four layers, back to front: a warm bloom where the plate would catch the
        light, a cool deepening toward the fold, the engraved hatching an
        intaglio ground is built from, and the rosette itself bleeding off the
        right edge. Flat colour would have been the one thing §2 rules out here.

        `color-mix` rather than a hex with alpha, because §3 is explicit that hex
        lives only in globals.css — so these tint the real tokens and follow any
        change to them.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(70rem 40rem at 78% -10%, color-mix(in oklab, var(--accent) 13%, transparent), transparent 62%)',
            'radial-gradient(50rem 32rem at 8% 8%, color-mix(in oklab, var(--color-pending) 8%, transparent), transparent 58%)',
            'linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--bg-inset) 85%, transparent) 100%)',
          ].join(','),
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          background:
            'repeating-linear-gradient(180deg, color-mix(in oklab, var(--line-subtle) 55%, transparent) 0 1px, transparent 1px 7px)',
          maskImage: 'radial-gradient(60rem 34rem at 50% 25%, black, transparent 78%)',
        }}
      />

      {/*
        The plate, masked at its own edge.

        An SVG clips to its viewport, so a rosette that fills its box ends on a
        hard vertical cut — which read as a seam straight down the hero rather
        than as engraving. The radial mask dissolves the curve family into the
        ground the way ink actually thins at the edge of a struck plate.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[22rem] -right-[26rem] -z-10 h-[64rem] w-[64rem] md:-right-[16rem]"
        style={{
          maskImage: 'radial-gradient(closest-side, black 40%, transparent 92%)',
          WebkitMaskImage: 'radial-gradient(closest-side, black 40%, transparent 92%)',
        }}
      >
        <GuillocheRosette className="h-full w-full text-accent opacity-[0.16]" />
      </div>

      <div className="marketing-container pt-20 pb-24 md:pt-28 md:pb-32">
        <p
          className="enter-expressive money text-micro uppercase text-accent"
          style={enter(120)}
        >
          Invoicing &amp; reconciliation
        </p>

        {/*
          Newsreader carrying real weight, which §5 reserves for exactly this.
          Fluid from 2.5rem so the two lines survive 360px without hyphenating,
          and past `text-display` at the top end because §2 permits 3.5rem+ here
          and a hero capped at the token would be the restrained surface's size.
        */}
        <h1
          className="enter-expressive mt-5 max-w-[19ch] font-display text-hero text-ink"
          style={{ ...enter(200), textWrap: 'balance' }}
        >
          Every payment matched.
          <br />
          <span className="italic text-accent">Every late invoice chased.</span>
        </h1>

        <p
          className="enter-expressive mt-7 max-w-[56ch] text-ink-secondary"
          style={{ ...enter(290), fontSize: '1.0625rem', lineHeight: 1.6 }}
        >
          Settled watches your payment gateways, records each payment against the right
          invoice in the currency it arrived in, and chases the ones that never turn up.
        </p>

        <div className="enter-expressive mt-10 flex flex-wrap items-center gap-3" style={enter(380)}>
          <Link
            href="/demo"
            className="ring-inverse inline-flex h-11 items-center rounded-sm bg-accent px-6 text-h4 text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover"
          >
            See it working
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-sm border border-line-strong px-6 text-h4 text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:border-accent hover:text-accent"
          >
            Sign in
          </Link>
        </div>

        {/*
          The plate legend: which gateways, stated as fact rather than as logos
          we have no licence to reproduce. Mono, because §5 makes the mono the
          identity and this is a list of systems rather than prose.
        */}
        <p
          className="enter-expressive money mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro uppercase text-ink-muted"
          style={enter(470)}
        >
          <span>Stripe</span>
          <span className="text-accent">·</span>
          <span>Paystack</span>
          <span className="text-accent">·</span>
          <span>Flutterwave</span>
          <span className="text-accent">·</span>
          <span>₦ $ £ €</span>
        </p>
      </div>

      <EngravedWave className="h-10 w-full text-accent opacity-[0.16]" />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The problem                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Four failures, each tagged with the state Settled would actually file it
 * under.
 *
 * The tags are not decoration and they are not invented vocabulary: `pending`,
 * `overdue`, `partial` and `failed` are real values in the payments and invoice
 * status enums, rendered in their real §3 tokens. So the section that describes
 * the problem is already speaking the product's language, and a reader who
 * clicks through to the demo meets the same words in the same colours.
 */
const PROBLEMS = [
  {
    tag: 'Unmatched',
    tone: 'pending',
    line: '₦450,000 landed on Tuesday.',
    body: 'It cleared into your account with a reference that means nothing. Three invoices are open for roughly that amount and you are guessing which one just got paid.',
  },
  {
    tag: 'Overdue',
    tone: 'overdue',
    line: 'That invoice went out in March.',
    body: 'It is June. Nobody chased it, because chasing is a thing you do when you remember, and you were working. The client has not thought about it since.',
  },
  {
    tag: 'Partial',
    tone: 'partial',
    line: 'They paid half and you lost track.',
    body: 'A deposit arrived, then a second instalment, then nothing. Working out what is still outstanding means opening three tabs and doing arithmetic you should not be doing.',
  },
  {
    tag: 'Stale',
    tone: 'failed',
    line: 'The spreadsheet was last right on the 4th.',
    body: 'Revenue lives across Stripe, Paystack, a bank app and a file you update when there is time. No two of them agree, and none of them is wrong enough to notice.',
  },
] as const;

const TONE: Record<string, string> = {
  pending: 'text-pending border-pending-line bg-pending-bg',
  overdue: 'text-overdue border-overdue-line bg-overdue-bg',
  partial: 'text-partial border-partial-line bg-partial-bg',
  failed: 'text-failed border-failed-line bg-failed-bg',
};

function Problem() {
  return (
    <section className="relative border-t border-line-subtle bg-surface-inset/60">
      <div className="marketing-container py-20 md:py-28">
        <h2
          className="enter-expressive max-w-[22ch] font-display text-ink"
          style={{
            ...enter(0),
            fontSize: 'clamp(1.9rem, 4vw, 2.75rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          You are not losing money on rates. You are losing it on the ones you
          forgot.
        </h2>

        {/*
          A ledger, not a card grid: entries separated by hairline rules, the
          state in a narrow left column the way an account book puts its folio
          reference. The rule between entries is the §1 structural grammar doing
          the work a border-radius would otherwise be asked to do.
        */}
        <ul className="mt-12">
          {PROBLEMS.map((problem, i) => (
            <li
              key={problem.tag}
              className="enter-expressive grid grid-cols-1 gap-x-8 gap-y-3 border-t border-line-subtle py-8 md:grid-cols-[10rem_1fr] last:border-b"
              style={enter(120 + i * 90)}
            >
              <div>
                <span
                  className={`money inline-flex items-center rounded-xs border border-l-[3px] px-2 py-0.5 text-micro uppercase ${TONE[problem.tone]}`}
                >
                  {problem.tag}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-display text-h2 text-ink md:text-[1.6rem] md:leading-[1.2]">
                  {problem.line}
                </p>
                <p className="mt-2 max-w-[62ch] text-body text-ink-secondary">
                  {problem.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* How it works                                                               */
/* -------------------------------------------------------------------------- */

const STEPS = [
  {
    title: 'They pay',
    body: 'Card, bank transfer, USSD, mobile money — whatever your gateway already accepts. Nothing changes for the client.',
  },
  {
    title: 'Settled records it',
    body: 'The payment is matched to its invoice and recorded in the currency it was paid in, within seconds of the gateway confirming it.',
  },
  {
    title: 'They get a receipt',
    body: 'Sent automatically, with the invoice attached as a PDF. You do not write it, and you do not remember to send it.',
  },
  {
    title: 'The rest gets chased',
    body: 'Anything still unpaid is followed up on your schedule — a nudge, then a firmer one, then a final notice. You set the days once.',
  },
] as const;

function HowItWorks() {
  return (
    <section className="relative border-t border-line-subtle">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(48rem 26rem at 20% 0%, color-mix(in oklab, var(--accent) 7%, transparent), transparent 70%)',
        }}
      />

      <div className="relative marketing-container py-20 md:py-28">
        <p className="enter-expressive money text-micro uppercase text-accent" style={enter(0)}>
          How it works
        </p>
        <h2
          className="enter-expressive mt-4 max-w-[24ch] font-display text-ink"
          style={{
            ...enter(70),
            fontSize: 'clamp(1.9rem, 4vw, 2.75rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          Four steps, and you are only present for the first one.
        </h2>

        {/*
          A rail rather than four cards. The connecting rule runs through the
          station marks — horizontal from `md`, vertical below — so the sequence
          is carried by the layout instead of by numbers stamped on boxes.
        */}
        <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-8">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="enter-expressive relative pl-10 md:pt-12 md:pl-0"
              style={enter(150 + i * 110)}
            >
              {/* The rail. Stops at the last station rather than running off. */}
              <span
                aria-hidden="true"
                className={`absolute top-2 left-[7px] w-px bg-line-subtle md:top-[7px] md:left-0 md:h-px md:w-full ${
                  i === STEPS.length - 1 ? 'bottom-0 md:hidden' : '-bottom-10 md:bottom-auto'
                }`}
              />
              {/* Station mark: an engraved ring with a struck copper centre. */}
              <span
                aria-hidden="true"
                className="absolute top-0 left-0 flex h-4 w-4 items-center justify-center rounded-full border border-line-strong bg-surface"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              </span>

              <p className="money text-micro uppercase text-ink-muted">
                Step {i + 1}
              </p>
              <h3 className="mt-2 font-display text-h2 text-ink">{step.title}</h3>
              <p className="mt-2 text-body text-ink-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* What it does                                                               */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    name: 'Unmatched queue',
    body: 'Money that arrives with nothing to attach it to goes into one list, with the invoices it could plausibly belong to ranked beside it. Matching is two clicks, and it is the only queue you have to look at.',
  },
  {
    name: 'Four currencies',
    body: 'Bill in naira, dollars, pounds or euros. Totals convert to one reporting currency at the rate recorded on the day — and when a rate is missing, the figure says so rather than quietly leaving money out.',
  },
  {
    name: 'The reminder ladder',
    body: 'Three escalating emails on days you choose. The first assumes they forgot. The last does not. Each one carries the invoice, and it stops the moment the money lands.',
  },
  {
    name: 'Invoices as documents',
    body: 'A real PDF with your business details, the line items, what has been paid and what is left — typeset rather than exported. The same document the client gets is the one attached to every reminder.',
  },
  {
    name: 'Nightly reconciliation',
    body: 'Webhooks get lost: a deploy lands mid-delivery, a gateway has an outage. Every night Settled asks each gateway what it actually recorded and fills in anything missing, so a lost notification is not a lost payment.',
  },
] as const;

function Features() {
  return (
    <section className="relative border-t border-line-subtle bg-surface-inset/60">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[26rem] -left-[20rem] h-[52rem] w-[52rem]"
        style={{
          maskImage: 'radial-gradient(closest-side, black 38%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(closest-side, black 38%, transparent 90%)',
        }}
      >
        {/* A different ratio from the hero's, so the two plates are not the
            same engraving at two sizes. 25 petals, closing in 6 turns. */}
        <GuillocheRosette
          className="h-full w-full text-accent opacity-[0.12]"
          bands={6}
          R={150}
          r={36}
        />
      </div>

      <div className="relative marketing-container py-20 md:py-28">
        <p className="enter-expressive money text-micro uppercase text-accent" style={enter(0)}>
          What it does
        </p>

        {/*
          Asymmetric on purpose: the name sits in a narrow column like the
          account name in a ledger, the sentence runs wide beside it. A even
          three-column grid of equal cards is the shape this brief rules out,
          and it would also read worse — these are five statements of different
          weight, not five peers.
        */}
        <dl className="mt-10">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.name}
              className="enter-expressive grid grid-cols-1 gap-x-10 gap-y-2 border-t border-line-subtle py-7 last:border-b md:grid-cols-[minmax(11rem,18rem)_1fr]"
              style={enter(80 + i * 80)}
            >
              <dt className="font-display text-h2 text-ink italic md:text-[1.45rem]">
                {feature.name}
              </dt>
              <dd className="max-w-[64ch] text-body text-ink-secondary">{feature.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* See it working                                                             */
/* -------------------------------------------------------------------------- */

function SeeItWorking() {
  return (
    <section className="relative border-t border-line-subtle">
      <div className="marketing-container py-20 md:py-28">
        {/*
          A certificate: engraved border, struck corners, a tinted plate ground.
          This is the page's one framed object, which is what lets it carry the
          weight of being the only thing the reader is asked to do.
        */}
        <div
          className="enter-expressive relative overflow-hidden rounded-md border border-line px-6 py-14 text-center md:px-16 md:py-20"
          style={{
            ...enter(0),
            background: [
              'radial-gradient(38rem 22rem at 50% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%)',
              'linear-gradient(180deg, var(--bg-raised), var(--bg-base))',
            ].join(','),
          }}
        >
          <EngravedWave className="pointer-events-none absolute inset-x-0 top-0 h-9 w-full text-accent opacity-[0.38]" />
          <EngravedWave className="pointer-events-none absolute inset-x-0 bottom-0 h-9 w-full text-accent opacity-[0.38]" />

          <CornerRosette className="pointer-events-none absolute top-2 left-2 h-14 w-14 text-accent opacity-45" />
          <CornerRosette className="pointer-events-none absolute top-2 right-2 h-14 w-14 -scale-x-100 text-accent opacity-45" />
          <CornerRosette className="pointer-events-none absolute bottom-2 left-2 h-14 w-14 -scale-y-100 text-accent opacity-45" />
          <CornerRosette className="pointer-events-none absolute right-2 bottom-2 h-14 w-14 -scale-100 text-accent opacity-45" />

          <div className="relative mx-auto max-w-[52ch]">
            <p className="money text-micro uppercase text-accent">Live demo</p>
            <h2
              className="mt-4 font-display text-ink"
              style={{
                fontSize: 'clamp(1.9rem, 4.4vw, 3rem)',
                lineHeight: 1.08,
                letterSpacing: '-0.02em',
                textWrap: 'balance',
              }}
            >
              Open the books and click around.
            </h2>
            <p className="mt-5 text-body text-ink-secondary">
              Not a video and not screenshots — a running copy with a full year of
              invoices, payments across three gateways, and a queue of money waiting to
              be matched. Sort it, filter it, open an invoice, read the PDF. It resets
              itself every night, so nothing you do there matters.
            </p>

            <Link
              href="/demo"
              className="ring-inverse mt-9 inline-flex h-12 items-center rounded-sm bg-accent px-8 text-h4 text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover"
            >
              Open the demo
            </Link>

            <p className="mt-4 text-small text-ink-muted">
              No sign-up, no email, nothing to install.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                     */
/* -------------------------------------------------------------------------- */

function Footer({
  settings,
}: {
  settings: Awaited<ReturnType<typeof getSettings>>;
}) {
  const address = settings.businessAddress
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <footer className="relative border-t border-line-subtle bg-surface-inset">
      <div className="marketing-container py-14">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div>
            {/*
              The product first, the operator second.

              Settings hold the details of whoever runs this instance, and in
              this deployment that is Refacint — so leading with the business
              name made the footer introduce itself twice, once as a heading and
              again in the disclosure below. The wordmark is the constant; the
              business block is labelled for what it is, which also reads
              correctly for any other tenant.
            */}
            <p className="font-display text-h2 text-ink">Settled</p>

            {settings.businessName ? (
              <p className="money mt-6 text-micro uppercase text-ink-muted">Operated by</p>
            ) : null}
            {settings.businessName ? (
              <p className="mt-1 text-body text-ink">{settings.businessName}</p>
            ) : null}

            {address.length > 0 ? (
              <address className="mt-2 text-small text-ink-secondary not-italic">
                {address.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : null}

            <div className="mt-3 flex flex-col gap-1 text-small">
              {settings.businessEmail ? (
                <a
                  href={`mailto:${settings.businessEmail}`}
                  className="money w-fit rounded-xs text-ink-secondary underline-offset-4 hover:text-accent hover:underline"
                >
                  {settings.businessEmail}
                </a>
              ) : null}
              {settings.businessPhone ? (
                <span className="money text-ink-secondary">{settings.businessPhone}</span>
              ) : null}
            </div>
          </div>

          <nav className="flex flex-col gap-2 text-small md:items-end">
            <Link
              href="/demo"
              className="w-fit rounded-xs text-ink-secondary underline-offset-4 hover:text-accent hover:underline"
            >
              Live demo
            </Link>
            <Link
              href="/login"
              className="w-fit rounded-xs text-ink-secondary underline-offset-4 hover:text-accent hover:underline"
            >
              Sign in
            </Link>
          </nav>
        </div>

        <EngravedWave className="mt-12 h-6 w-full text-accent opacity-[0.14]" />

        {/*
          The honest disclosure. §2 puts it here rather than in the hero — the
          page above sells the product on its merits, and a reader who wants to
          know what they are looking at finds out plainly, in the place a
          company's own fine print lives. Understating it would be worse than
          saying nothing.
        */}
        <p className="mt-8 max-w-[72ch] text-small text-ink-muted">
          Settled is a working demonstration built by{' '}
          <a
            href="https://refacint.com"
            rel="noopener noreferrer"
            target="_blank"
            className="rounded-xs text-ink-secondary underline underline-offset-4 hover:text-accent"
          >
            Refacint Technologies
          </a>
          . It runs on real infrastructure with live payment gateways; the invoices and
          clients in the demo are generated and reset nightly.
        </p>
      </div>
    </footer>
  );
}
