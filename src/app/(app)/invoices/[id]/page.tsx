import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import { getInvoice } from '@/lib/queries/invoices';
import { currencySymbol, formatDateFull, formatMinorDigits } from '@/lib/format';
import { firstValue, type RawSearchParams } from '@/lib/search-params';
import { InvoiceWriteActions } from '@/components/invoices/invoice-actions';
import { InvoiceLines } from '@/components/invoices/invoice-lines';
import { InvoicePayments } from '@/components/invoices/invoice-payments';
import { InvoiceReminders } from '@/components/invoices/invoice-reminders';
import { InvoiceSummary } from '@/components/invoices/invoice-summary';
import { PageHeader } from '@/components/shell/page-header';
import { StatusBadge, invoiceStatusKey } from '@/components/ui/status-badge';

/**
 * The tab and history entry carry the invoice number. Deliberately no client
 * name and no amount: a browser title is the one part of this page that leaks
 * into screen shares, bookmark bars and shoulder-surfing range.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await getInvoice(id);
  return { title: invoice ? `${invoice.number} · Settled` : 'Invoice · Settled' };
}

/** Overdue is derived from `now()`, so this page can never be cached. */
export const dynamic = 'force-dynamic';

/**
 * Signed in only — an invoice names a real client and a real sum. See the
 * route-gating rule at the top of `@/lib/auth/guard`.
 */

/**
 * Keys the list page understands. Anything else in `back` is dropped.
 *
 * `back` carries the list's query string so the breadcrumb returns to the
 * filtered view the reader actually came from, rather than dumping them at an
 * unfiltered page 1 and making them rebuild it.
 *
 * Named `back`, not `from`: `from` is already the list's issued-from date
 * filter, so `/invoices/<id>?from=2026-01-01` would be a URL that looks
 * meaningful, parses as a query string, and silently yields nothing.
 *
 * A search param rather than the Referer header, for three reasons: Next's
 * client-side navigation does not set Referer at all, a cross-origin arrival
 * strips it under the default referrer policy, and a value that is sometimes
 * present produces a back link that sometimes silently forgets — worse than one
 * that never remembered. The param is explicit and survives a refresh, a
 * bookmark and a shared link.
 *
 * It is re-parsed and re-serialised rather than pasted through, so a crafted
 * link cannot smuggle anything into the href.
 */
const LIST_PARAM_KEYS = ['status', 'client', 'currency', 'from', 'to', 'q', 'sort', 'dir', 'page'];

function backHref(carrier: string | undefined): string {
  if (!carrier) return '/invoices';

  const incoming = new URLSearchParams(carrier);
  const clean = new URLSearchParams();
  for (const key of LIST_PARAM_KEYS) {
    for (const value of incoming.getAll(key)) {
      if (value !== '') clean.append(key, value);
    }
  }

  const query = clean.toString();
  return query ? `/invoices?${query}` : '/invoices';
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  await requireUser();

  // Next 16: both are promises.
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const back = backHref(firstValue(query.back));

  /*
   * Read here, in the page body, NOT inside a Suspense boundary.
   *
   * The first version wrapped this in <Suspense> with a skeleton, and every
   * missing invoice came back HTTP 200. Measured with curl: `not-a-uuid`,
   * an absent uuid and a real invoice all returned 200. The boundary lets Next
   * flush the shell before the suspended child resolves, so by the time
   * notFound() throws, the status line has already gone out — the 404 UI
   * renders under a 200, which is wrong for crawlers, uptime checks and
   * anything that reads the status rather than the pixels.
   *
   * Awaiting before the first flush is what makes the status honest. Nothing is
   * lost: this page is one query, and its own title is the invoice number, so
   * there is no meaningful shell to stream ahead of the data anyway.
   *
   * notFound() throws a NEXT_NOT_FOUND signal that Next unwinds into the 404
   * boundary. Nothing here may catch it — hence no try/catch around the read.
   */
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  // Presentation only. Every action re-checks with assertCanWrite on the server.
  const readOnly = await isReadOnly();
  const badge = invoiceStatusKey(invoice.status);
  const symbol = currencySymbol(invoice.currency);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={back}
            className="rounded-xs uppercase underline-offset-2 hover:text-ink hover:underline"
          >
            ← Invoices
          </Link>
        }
        title={<span className="money">{invoice.number}</span>}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <StatusBadge status={badge.key} label={badge.label} />
            {invoice.daysOverdue > 0 ? (
              <span className="money text-small whitespace-nowrap text-overdue">
                {invoice.daysOverdue} {invoice.daysOverdue === 1 ? 'day' : 'days'} overdue
              </span>
            ) : null}
            {/*
              Hidden entirely for a viewer, not disabled. A greyed-out control
              advertises a capability the reader does not have and invites them
              to ask why it does not work; absence says nothing. This is
              presentation only — every action calls assertCanWrite() on the
              server before it validates or reads anything.
            */}
            {readOnly ? null : (
              <InvoiceWriteActions
                invoiceId={invoice.id}
                status={invoice.storedStatus}
                hasLineItems={invoice.lineItems.length > 0}
                paymentCount={invoice.payments.length}
              />
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <Fact label="Client">
            {/* /clients/[id] does not exist yet — the link is built now so the
                shape of the app is honest, and it will resolve when it does. */}
            <Link
              href={`/clients/${invoice.client.id}`}
              className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              {invoice.client.name}
            </Link>
            {invoice.client.email ? (
              <span className="money block text-micro text-ink-muted">
                {invoice.client.email}
              </span>
            ) : null}
          </Fact>

          <Fact label="Issued">
            <span className="money">
              {invoice.issuedAt ? formatDateFull(invoice.issuedAt) : 'Not issued'}
            </span>
          </Fact>

          <Fact label="Due">
            <span
              className={`money ${invoice.daysOverdue > 0 ? 'text-overdue' : ''}`}
            >
              {invoice.dueAt ? formatDateFull(invoice.dueAt) : 'No due date'}
            </span>
          </Fact>

          <Fact label="Amount">
            <span className="money whitespace-nowrap">
              <span className="currency-mark">{symbol}</span>
              {formatMinorDigits(invoice.amountMinor)}
            </span>
          </Fact>
        </dl>

        {/*
          The invoice's own description. It was collected by the form and then
          rendered nowhere except the pre-itemisation fallback, so on an
          itemised invoice everything the user typed here vanished on save.
          It sits under the facts rather than among them because it is a
          sentence, not a field.
        */}
        {invoice.description ? (
          <p className="max-w-[70ch] text-small text-ink-secondary">{invoice.description}</p>
        ) : null}

        {/*
          The summary is FIRST in the DOM and moved right by `order` at lg.
          Below lg the columns stack in document order, so the summary leads —
          "what is still owed" is what someone opening an invoice on a phone
          came for, and burying it under three tables of history makes them
          scroll past the whole story to reach the answer. The `order` classes
          only take effect once there are two columns to order.
        */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="lg:order-2 lg:w-[320px] lg:shrink-0">
            <InvoiceSummary invoice={invoice} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-6 lg:order-1">
            <InvoiceLines invoice={invoice} />
            <InvoicePayments invoice={invoice} />
            <InvoiceReminders invoice={invoice} />
          </div>
        </div>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-micro uppercase text-ink-muted">{label}</dt>
      <dd className="text-small text-ink">{children}</dd>
    </div>
  );
}
