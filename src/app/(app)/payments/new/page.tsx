import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth/guard';
import { getPayableClients } from '@/lib/queries/payments';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { BASE_CURRENCY } from '@/lib/queries/dashboard';
import {
  outstandingMinorExpr,
  settledPaymentsCte,
} from '@/lib/queries/invoice-status';
import { PageHeader } from '@/components/shell/page-header';
import {
  ManualPaymentForm,
  type OpenInvoice,
} from '@/components/payments/payment-form';

export const metadata: Metadata = { title: 'Record a payment · Settled' };
export const dynamic = 'force-dynamic';

/**
 * `requireAdmin`, not `requireUser`. This page exists only to write, so a
 * viewer who cannot write has no version of it to see — showing a form that
 * refuses on submit is worse than not offering it.
 */

/**
 * Every open invoice, for the form's picker.
 *
 * Loaded whole rather than per-client, because the picker narrows by client AND
 * currency as the user types, and a round trip on every change of either would
 * make a two-field form feel like a queue. The set is bounded by how much work
 * an agency has outstanding — tens of rows, not thousands.
 */
async function openInvoices(): Promise<OpenInvoice[]> {
  const result = await db.execute(sql`
    with ${settledPaymentsCte}
    select
      i.id::text                     as id,
      i.number,
      i.client_id::text              as client_id,
      i.currency,
      ${outstandingMinorExpr}::text  as outstanding_minor
    from invoices i
    left join settled s on s.invoice_id = i.id
    where i.status not in ('void', 'draft')
    order by i.issued_at desc nulls last, i.number desc
  `);

  return (result.rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    number: String(r.number),
    clientId: String(r.client_id),
    currency: String(r.currency),
    outstandingMinor: BigInt(String(r.outstanding_minor ?? '0')),
  }));
}

export default async function NewPaymentPage() {
  await requireAdmin();

  const [clients, invoices] = await Promise.all([getPayableClients(), openInvoices()]);

  return (
    <>
      <PageHeader
        eyebrow="Payments"
        title="Record a payment"
        description="For cash, a bank transfer, or anything else that never came through a gateway."
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        <ManualPaymentForm
          clients={clients}
          invoices={invoices}
          defaultCurrency={BASE_CURRENCY}
        />
      </div>
    </>
  );
}
