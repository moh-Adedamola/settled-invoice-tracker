import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import { getAssignableClients } from '@/lib/queries/clients';
import { InvoiceForm } from '@/components/invoices/invoice-form';
import { PageHeader } from '@/components/shell/page-header';

import { createInvoice } from '../actions';

export const metadata: Metadata = { title: 'New invoice · Settled' };
export const dynamic = 'force-dynamic';

export default async function NewInvoicePage() {
  await requireUser();

  /*
   * A viewer reaching this URL directly is sent back to the list rather than
   * shown a form that will refuse them. `assertCanWrite` in the action is what
   * actually protects the write; this only avoids a dead end.
   */
  if (await isReadOnly()) redirect('/invoices');

  /*
   * getAssignableClients, NOT getInvoiceFilterOptions. The latter inner-joins
   * invoices, so it could only ever offer a client who had already been billed
   * — a client created this morning could not be invoiced this afternoon. It
   * also excludes archived clients, which is the point of archiving.
   */
  const clients = await getAssignableClients();

  return (
    <>
      <PageHeader
        eyebrow="New"
        title="New invoice"
        description="Saved as a draft. Nothing is sent until you mark it as sent."
      />
      <div className="px-6 py-6">
        <InvoiceForm
          action={createInvoice}
          options={{ clients, currencies: [] }}
          submitLabel="Create draft"
          cancelHref="/invoices"
          initial={{
            clientId: '',
            currency: 'NGN',
            issuedAt: '',
            dueAt: '',
            description: '',
            lineItems: [],
          }}
        />
      </div>
    </>
  );
}
