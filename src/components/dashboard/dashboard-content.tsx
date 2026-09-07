import {
  getKpis,
  getOverdueInvoices,
  getProviderBreakdown,
  getRecentActivity,
  getRevenueByMonth,
  getUnmatchedPayments,
} from '@/lib/queries/dashboard';
import { formatCompactMajor, formatMinor } from '@/lib/format';

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
      monthLabel: new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString(
        'en-GB',
        { month: 'short', year: '2-digit', timeZone: 'UTC' },
      ),
      plotMajor: major,
      formatted: formatMinor(month.totalMinor, month.currency),
      tick: formatCompactMajor(major, month.currency),
      paymentCount: month.paymentCount,
      isPartial: month.isPartial,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <KpiRow kpis={kpis} />

      <RevenueChart data={chartData} currency={kpis.revenue.currency} />

      <OverdueTable invoices={overdue} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ProviderBreakdown providers={providers} />
        <ActivityFeed entries={activity} />
      </div>

      <UnmatchedQueue payments={unmatched} readOnly={readOnly} />
    </div>
  );
}
