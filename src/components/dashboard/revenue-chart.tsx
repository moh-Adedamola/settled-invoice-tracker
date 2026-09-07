'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Bars, not a line. The data is a magnitude per discrete period and the months
 * are compared against each other, not read as a continuous signal — and a line
 * across a partial final month implies a trend that has not happened yet.
 *
 * One series, so no legend: the heading names it (dataviz: a single series
 * needs no legend box).
 *
 * `plotMajor` is a `number` because it is a pixel coordinate. Every figure a
 * person reads — tick, tooltip, table — comes from `formatted`, which was
 * produced from the bigint on the server. No money arithmetic happens here.
 */
export type RevenuePoint = {
  month: string;
  monthLabel: string;
  plotMajor: number;
  formatted: string;
  tick: string;
  paymentCount: number;
  isPartial: boolean;
};

export function RevenueChart({
  data,
  currency,
}: {
  data: RevenuePoint[];
  currency: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-raised p-4">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h2 className="text-h3 text-ink">Revenue</h2>
        <p className="text-small text-ink-muted">
          Last {data.length} months · {currency}
        </p>
      </div>
      <p className="mb-4 text-small text-ink-muted">
        Succeeded payments only. The current month is still in progress and is
        drawn hatched.
      </p>

      {/* The SVG is decorative to assistive tech; the table below carries the
          same figures. A chart alone is unreadable to a screen reader. */}
      <div aria-hidden="true" className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="0"
              vertical={false}
            />
            <XAxis
              dataKey="monthLabel"
              tickLine={false}
              axisLine={{ stroke: 'var(--chart-grid)' }}
              tick={{
                fill: 'var(--chart-axis)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
            />
            <YAxis
              width={56}
              tickLine={false}
              axisLine={false}
              tick={{
                fill: 'var(--chart-axis)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
              }}
              tickFormatter={(_value: number, index: number) =>
                data[index]?.tick ?? ''
              }
              dataKey="plotMajor"
            />
            <Tooltip
              cursor={{ fill: 'var(--row-hover)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as RevenuePoint | undefined;
                if (!point) return null;
                return (
                  <div className="rounded-md border border-line bg-surface-overlay px-3 py-2 shadow-md">
                    <p className="text-micro uppercase text-ink-muted">
                      {point.monthLabel}
                      {point.isPartial ? ' · in progress' : ''}
                    </p>
                    <p className="money mt-1 text-body text-ink">
                      {point.formatted}
                    </p>
                    <p className="text-small text-ink-muted">
                      {point.paymentCount} payment
                      {point.paymentCount === 1 ? '' : 's'}
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="plotMajor" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((point) => (
                <Cell
                  key={point.month}
                  fill="var(--chart-positive)"
                  /* §4: the month in progress is never a solid bar — 42%
                     opacity plus a dashed stroke, so an incomplete month cannot
                     be misread as a decline. */
                  fillOpacity={point.isPartial ? 0.42 : 1}
                  stroke={point.isPartial ? 'var(--chart-positive)' : undefined}
                  strokeDasharray={point.isPartial ? '4 3' : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Revenue by month, {currency}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Revenue</th>
            <th scope="col">Payments</th>
            <th scope="col">Complete</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.month}>
              <th scope="row">{point.monthLabel}</th>
              <td>{point.formatted}</td>
              <td>{point.paymentCount}</td>
              <td>{point.isPartial ? 'Month in progress' : 'Complete'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
