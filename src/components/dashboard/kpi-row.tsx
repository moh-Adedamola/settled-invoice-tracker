import Link from 'next/link';

import type { DashboardKpis } from '@/lib/queries/dashboard';
import { currencySymbol, formatMinorDigits } from '@/lib/format';

function Tile({
  label,
  children,
  note,
}: {
  label: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-surface-raised p-4">
      <p className="text-micro uppercase text-ink-muted">{label}</p>
      {children}
      {note ? <div className="text-small text-ink-muted">{note}</div> : null}
    </div>
  );
}

function Figure({ minor, currency }: { minor: bigint; currency: string }) {
  return (
    <p className="money text-h3 whitespace-nowrap text-ink">
      <span className="currency-mark">{currencySymbol(currency)}</span>
      {formatMinorDigits(minor, currency)}
    </p>
  );
}

/** The per-currency breakdown under Outstanding. Shared by both layouts. */
function OutstandingNote({
  outstanding,
}: {
  outstanding: DashboardKpis['outstanding'];
}) {
  return (
    <>
      <span className="block">
        {outstanding.byCurrency.map((c, i) => (
          <span key={c.currency} className="money">
            {i > 0 ? '  ·  ' : ''}
            {currencySymbol(c.currency)}
            {formatMinorDigits(c.minor, c.currency)}
          </span>
        ))}
      </span>
      <span className="block">
        approx. at live FX · {outstanding.invoiceCount} invoices
      </span>
      {outstanding.unconvertible.length > 0 ? (
        <span className="block text-failed">
          no rate for {outstanding.unconvertible.join(', ')} — excluded
        </span>
      ) : null}
    </>
  );
}

/** The per-currency amounts under Unmatched. Shared by both layouts. */
function UnmatchedAmounts({
  unmatched,
}: {
  unmatched: DashboardKpis['unmatched'];
}) {
  if (unmatched.byCurrency.length === 0) return <>nothing awaiting a match</>;
  return (
    <>
      {unmatched.byCurrency.map((c, i) => (
        <span key={c.currency} className="money">
          {i > 0 ? '  ·  ' : ''}
          {currencySymbol(c.currency)}
          {formatMinorDigits(c.minor, c.currency)}
        </span>
      ))}
    </>
  );
}

export function KpiRow({ kpis }: { kpis: DashboardKpis }) {
  const { revenue, outstanding, overdue, unmatched } = kpis;

  // Column count follows a guaranteed minimum tile width, not breakpoints.
  //
  // Measured: a full-precision figure needs ~149px and the outstanding tile
  // ~160px, so a tile has to be at least ~192px wide. A five-column row
  // inside the 248px sidebar leaves only 150px per tile at 1280 and 167px at
  // 1366, and no usable type size survives that, so the column count gives
  // way instead. auto-fit lands on five across from 1440px and steps down to
  // four below it, with every figure whole.
  //
  // Deliberately NOT breakpoint variants: Tailwind v4 sorts arbitrary media
  // variants before named ones, so both min-[1440px]: and a custom named
  // breakpoint compiled ahead of lg: and lost at every width.
  // See design system section 5.
  //
  // ## Below md this is not a row of tiles at all
  //
  // auto-fit resolves to ONE column at 390px, so the five tiles became five
  // identical bordered boxes stacked 604px tall, every figure at the same
  // size and the same weight. A reader opening this page on a phone is asking
  // "what am I owed and what needs action"; a five-way tie answers neither.
  //
  // Three tiers instead, in the order the question is asked:
  //
  //   1. Outstanding  - the hero figure, text-h2, alone in its box
  //   2. Overdue / Unmatched - alert rows, and LINKS to the sections that
  //      list them, because a count is a prompt and the reader's next move
  //      after reading it is always to go and look
  //   3. Total revenue / This month - context, no boxes, text-small
  //
  // The tiles are kept verbatim at md and up, where five across is correct
  // and the row is the dashboard's signature.
  return (
    <section aria-label="Key figures">
      <div className="flex flex-col gap-group md:hidden">
        {/* Tier 1 — the figure the page exists to answer. */}
        <div className="flex flex-col gap-within rounded-md border border-line bg-surface-raised p-4">
          <p className="text-micro uppercase text-ink-muted">Outstanding</p>
          {/*
            text-h2 (24px at 390px), against text-small for the context tier.
            Section 5's "one size, every tile, every width" rule described a row
            of five equal tiles and is superseded below md only - see the note
            there. Measured: the widest figure this renders is
            `≈₦38,689,993.98` at ~216px against 308px of content box.
          */}
          <p className="money text-h2 whitespace-nowrap text-ink">
            <span className="currency-mark">
              ≈{currencySymbol(outstanding.baseCurrency)}
            </span>
            {formatMinorDigits(outstanding.baseMinor, outstanding.baseCurrency)}
          </p>
          <div className="text-small text-ink-muted">
            <OutstandingNote outstanding={outstanding} />
          </div>
        </div>

        {/* Tier 2 — what needs action. Anchors rather than plain figures. */}
        <div className="flex flex-col gap-within">
          <AlertRow
            href="#overdue"
            tone="overdue"
            mark="▲"
            count={overdue.count}
            noun={overdue.count === 1 ? 'overdue invoice' : 'overdue invoices'}
            amount={
              <>
                ≈{currencySymbol(overdue.baseCurrency)}
                {formatMinorDigits(overdue.baseMinor, overdue.baseCurrency)}
              </>
            }
          />
          <AlertRow
            href="#unmatched"
            tone="pending"
            mark="◐"
            count={unmatched.count}
            noun={unmatched.count === 1 ? 'unmatched payment' : 'unmatched payments'}
            amount={<UnmatchedAmounts unmatched={unmatched} />}
          />
        </div>

        {/* Tier 3 — context. No borders: section 6 spends a border on "this is
            a separate object", and these two are a footnote to the figure
            above, not two more objects competing with it. */}
        <div className="grid grid-cols-2 gap-within border-t border-line-subtle pt-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-micro uppercase text-ink-muted">Total revenue</p>
            <p className="money text-small whitespace-nowrap text-ink-secondary">
              <span className="currency-mark">{currencySymbol(revenue.currency)}</span>
              {formatMinorDigits(revenue.allTimeMinor, revenue.currency)}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-micro uppercase text-ink-muted">This month</p>
            <p className="money text-small whitespace-nowrap text-ink-secondary">
              <span className="currency-mark">{currencySymbol(revenue.currency)}</span>
              {formatMinorDigits(revenue.currentMonthMinor, revenue.currency)}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-group md:grid">
      <Tile label="Total revenue">
        <Figure minor={revenue.allTimeMinor} currency={revenue.currency} />
      </Tile>

      <Tile label="This month">
        <Figure minor={revenue.currentMonthMinor} currency={revenue.currency} />
      </Tile>

      {/*
        The base total is a conversion at the most recent fx_rates row per pair,
        so it moves with the rate and is not a figure to reconcile against. The
        per-currency lines beneath it are exact — they are what the invoices
        actually say. Presenting only the converted number would imply a
        precision the data does not have.
      */}
      <Tile
        label="Outstanding"
        note={
          <>
            <span className="block">
              {outstanding.byCurrency.map((c, i) => (
                <span key={c.currency} className="money">
                  {i > 0 ? '  ·  ' : ''}
                  {currencySymbol(c.currency)}
                  {formatMinorDigits(c.minor, c.currency)}
                </span>
              ))}
            </span>
            <span className="block">
              approx. at live FX · {outstanding.invoiceCount} invoices
            </span>
            {outstanding.unconvertible.length > 0 ? (
              <span className="block text-failed">
                no rate for {outstanding.unconvertible.join(', ')} — excluded
              </span>
            ) : null}
          </>
        }
      >
        <p className="money text-h3 whitespace-nowrap text-ink">
          {/* The approximation mark rides with the currency mark rather than
              sitting as a full-size character plus a space, which cost 25px
              and made this the only tile that overflowed. */}
          <span className="currency-mark">
            ≈{currencySymbol(outstanding.baseCurrency)}
          </span>
          {formatMinorDigits(outstanding.baseMinor, outstanding.baseCurrency)}
        </p>
      </Tile>

      <Tile
        label="Overdue"
        note={
          <span className="money block">
            ≈ {currencySymbol(overdue.baseCurrency)}
            {formatMinorDigits(overdue.baseMinor, overdue.baseCurrency)} outstanding
          </span>
        }
      >
        <p className="money text-h3 whitespace-nowrap text-overdue">
          <span aria-hidden="true" className="mr-1.5 text-[0.6em] align-middle">
            ▲
          </span>
          {overdue.count}
        </p>
      </Tile>

      <Tile
        label="Unmatched"
        note={
          <span className="block">
            {unmatched.byCurrency.map((c, i) => (
              <span key={c.currency} className="money">
                {i > 0 ? '  ·  ' : ''}
                {currencySymbol(c.currency)}
                {formatMinorDigits(c.minor, c.currency)}
              </span>
            ))}
            {unmatched.byCurrency.length === 0 ? 'nothing awaiting a match' : null}
          </span>
        }
      >
        <p className="money text-h3 whitespace-nowrap text-ink">{unmatched.count}</p>
      </Tile>
      </div>
    </section>
  );
}

/**
 * A count that needs acting on, and the route to acting on it.
 *
 * A link rather than a tile: the reader's next move after reading "7 overdue"
 * is always to go and look at the seven, and on a phone that was a 900px scroll
 * past a chart. The anchor costs nothing and removes the scroll.
 */
function AlertRow({
  href,
  tone,
  mark,
  count,
  noun,
  amount,
}: {
  href: string;
  tone: 'overdue' | 'pending';
  mark: string;
  count: number;
  noun: string;
  amount: React.ReactNode;
}) {
  const skin =
    tone === 'overdue'
      ? 'border-overdue-line border-l-overdue bg-overdue-bg text-overdue'
      : 'border-pending-line border-l-pending bg-pending-bg text-pending';

  return (
    <Link
      href={href}
      /*
        flex-wrap with a nowrap label, not a plain flex row. Measured at 390px:
        `◐ 4 unmatched payments` plus two currency figures wants ~295px of a
        284px content box, so the row broke — and it broke inside the phrase,
        giving "4 unmatched" over "payments". Wrapping is the right behaviour
        here (a third currency would overflow any fixed layout); breaking the
        noun is not. The label refuses to break, so the amount takes the second
        line whole and stays flush right.
      */
      className={`flex min-h-control flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-sm border border-l-[3px] px-3 py-2 transition-colors duration-[var(--duration-fast)] ease-standard hover:brightness-95 ${skin}`}
    >
      <span className="flex items-baseline gap-2 whitespace-nowrap">
        <span aria-hidden="true" className="text-[0.75em]">
          {mark}
        </span>
        <span className="text-h4">
          <span className="money">{count}</span> {noun}
        </span>
      </span>
      <span className="money ml-auto shrink-0 text-micro whitespace-nowrap">
        {amount}
      </span>
    </Link>
  );
}
