import {
  getKpis,
  getOverdueInvoices,
  getProviderBreakdown,
  getRecentActivity,
  getRevenueByMonth,
  getUnmatchedPayments,
} from '@/lib/queries/dashboard';
import { formatMinor } from '@/lib/format';

import { ActivityFeed } from './activity-feed';
import { KpiRow } from './kpi-row';
import { OverdueTable } from './overdue-table';
import { ProviderBreakdown } from './provider-breakdown';
import { RevenueChart, type RevenuePoint } from './revenue-chart';
import { UnmatchedQueue } from './unmatched-queue';

/**
 * One consistent read.
 *
 * Every figure on the page comes from this single `Promise.all`, so the KPI
 * row cannot disagree with the tables beneath it. Fetching per-component would
 * let a payment land between two queries and produce a dashboard that
 * contradicts itself — the failure mode the query layer was written to avoid.
 */
export async function DashboardContent({ readOnly }: { readOnly: boolean }) {
  const [kpis, revenue, providers, overdue, activity, unmatched] =
    await Promise.all([
      getKpis(),
      getRevenueByMonth(6),
      getProviderBreakdown(6),
      getOverdueInvoices(10),
      getRecentActivity(15),
      getUnmatchedPayments(),
    ]);

  /**
   * bigint does not cross the server/client boundary, and Recharts needs a
   * number for pixel positions. Everything a person reads is formatted here,
   * on the server, from the bigint. `plotMajor` is a coordinate, not an amount.
   */
  const chartData: RevenuePoint[] = revenue.map((month) => {
    const major = Number(month.totalMinor / 100n);
    return {
      month: month.month,
      // en-US, not en-GB: en-GB renders September as 'Sept' while every other
      // month is three letters, so the axis had one odd label out.
      monthLabel: new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString(
        'en-US',
        { month: 'short', year: '2-digit', timeZone: 'UTC' },
      ),
      plotMajor: major,
      formatted: formatMinor(month.totalMinor, month.currency),
      paymentCount: month.paymentCount,
      isPartial: month.isPartial,
    };
  });

  return (
    /* §6: these are sections, so `gap-section` — 28px below md, 24px above it.
       The raw `gap-6` it replaces was the same 24px at every width, and 24px
       was simultaneously the gap between two fields inside the filter panels.
       One number cannot mean both; the token says which one this is. */
    <div className="flex flex-col gap-section">
      {/*
        Order: what am I owed, what needs action, how are things going.

        The chart used to sit second, between the figures and the two lists of
        things to do. That is a desk reading order — at 1600px the overdue table
        is on screen beside it anyway. On a phone it put 360px of six-month
        trend between "7 overdue" and the seven, so the reader scrolled past
        analysis to reach the work.

        Changed at BOTH widths rather than reordered with CSS. `order` moves
        boxes and leaves the DOM alone, so a screen reader and a keyboard would
        still traverse the desk order while the page showed another — two
        reading orders for one page. Action before analysis is defensible at
        1600px too, which is what makes one order possible.
      */}
      <KpiRow kpis={kpis} />

      <OverdueTable invoices={overdue} />

      <UnmatchedQueue payments={unmatched} readOnly={readOnly} />

      <RevenueChart data={chartData} currency={kpis.revenue.currency} />

      {/* items-start: grid children stretch to the tallest by default, which
          left the provider card with ~300px of dead space below its four bars.
          Each card should be the height of its own content. */}
      <div className="grid grid-cols-1 items-start gap-section lg:grid-cols-2">
        <ActivityFeed entries={activity} />
        <ProviderBreakdown providers={providers} />
      </div>
    </div>
  );
}
