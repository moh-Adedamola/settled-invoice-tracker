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
      {formatMinorDigits(minor)}
    </p>
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
  return (
    <section
      aria-label="Key figures"
      className="grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4"
    >
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
                  {formatMinorDigits(c.minor)}
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
          {formatMinorDigits(outstanding.baseMinor)}
        </p>
      </Tile>

      <Tile
        label="Overdue"
        note={
          <span className="money block">
            ≈ {currencySymbol(overdue.baseCurrency)}
            {formatMinorDigits(overdue.baseMinor)} outstanding
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
                {formatMinorDigits(c.minor)}
              </span>
            ))}
            {unmatched.byCurrency.length === 0 ? 'nothing awaiting a match' : null}
          </span>
        }
      >
        <p className="money text-h3 whitespace-nowrap text-ink">{unmatched.count}</p>
      </Tile>
    </section>
  );
}
