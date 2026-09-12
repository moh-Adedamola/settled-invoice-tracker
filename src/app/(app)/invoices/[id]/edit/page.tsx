import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import { getInvoice } from '@/lib/queries/invoices';
import { getAssignableClients } from '@/lib/queries/clients';
import { dateToForm } from '@/lib/invoices/form-schema';
import { formatMinorDigits } from '@/lib/format';
import { InvoiceForm } from '@/components/invoices/invoice-form';
import { PageHeader } from '@/components/shell/page-header';

import { updateInvoice } from '../../actions';

export const metadata: Metadata = { title: 'Edit invoice · Settled' };
export const dynamic = 'force-dynamic';

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  if (await isReadOnly()) redirect('/invoices');

  const { id } = await params;

  // Read before the Suspense boundary, so notFound() can still set the status.
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  /*
   * Only a draft is editable, and the check is repeated in the UPDATE's WHERE
   * clause. This one exists so a stale link shows an explanation instead of a
   * form that fails on submit.
   */
  if (invoice.storedStatus !== 'draft') {
    return (
      <>
        <PageHeader
          eyebrow={
            <Link href={`/invoices/${invoice.id}`} className="rounded-xs uppercase underline-offset-2 hover:text-ink hover:underline">
              ← {invoice.number}
            </Link>
          }
          title={<span className="money">{invoice.number}</span>}
        />
        <div className="px-6 py-6">
          <div className="max-w-[60ch] rounded-md border border-line bg-surface-raised p-4">
            <h2 className="text-h3 text-ink">This invoice cannot be edited</h2>
            <p className="mt-2 text-small text-ink-secondary">
              It was marked as sent, so the client already has a copy showing{' '}
              <span className="money whitespace-nowrap">
                {formatMinorDigits(invoice.amountMinor)} {invoice.currency}
              </span>
              . Rewriting it here would leave two different documents with the same
              number. Void it and issue a replacement, or raise a credit note.
            </p>
            <Link
              href={`/invoices/${invoice.id}`}
              className="mt-4 inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-small text-ink hover:bg-row-hover"
            >
              Back to the invoice
            </Link>
          </div>
        </div>
      </>
    );
  }

  const clients = await getAssignableClients();

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/invoices/${invoice.id}`} className="rounded-xs uppercase underline-offset-2 hover:text-ink hover:underline">
            ← {invoice.number}
          </Link>
        }
        title={<span className="money">{invoice.number}</span>}
        description="Draft — edits replace the invoice and its lines."
      />
      <div className="px-6 py-6">
        <InvoiceForm
          action={updateInvoice}
          options={{ clients, currencies: [] }}
          invoiceId={invoice.id}
          submitLabel="Save draft"
          cancelHref={`/invoices/${invoice.id}`}
          initial={{
            clientId: invoice.client.id,
            currency: invoice.currency,
            issuedAt: dateToForm(invoice.issuedAt),
            dueAt: dateToForm(invoice.dueAt),
            description: invoice.description ?? '',
            lineItems: invoice.lineItems.map((line) => ({
              description: line.description,
              quantity: line.quantity,
              // Grouped, matching what the field shows while typing. The
              // parser strips separators, so this round-trips exactly.
              unitAmount: formatMinorDigits(line.unitAmountMinor),
            })),
          }}
        />
      </div>
    </>
  );
}
