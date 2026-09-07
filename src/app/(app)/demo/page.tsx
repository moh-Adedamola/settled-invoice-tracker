import { Suspense } from 'react';
import type { Metadata } from 'next';

import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { DashboardSkeleton } from '@/components/dashboard/skeleton';
import { PageHeader } from '@/components/shell/page-header';

export const metadata: Metadata = {
  title: 'Demo · Settled',
  description: 'A read-only tour of Settled, running on generated data.',
};

/**
 * Public. Always read-only, even for a signed-in admin — this route is the
 * public face of the product, not a second way into the real books.
 */
export default function DemoPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        eyebrow="Demo"
        description="Revenue, what is owed, and what still needs matching."
      />
      <div className="px-6 py-6">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent readOnly />
        </Suspense>
      </div>
    </>
  );
}
