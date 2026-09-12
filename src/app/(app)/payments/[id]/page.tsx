import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import { getMatchCandidates, getPayment } from '@/lib/queries/payments';
import { currencySymbol, formatDateFull, formatDateTime, formatMinorDigits } from '@/lib/format';
import { PageHeader } from '@/components/shell/page-header';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { StatusBadge, invoiceStatusKey, paymentStatusKey } from '@/components/ui/status-badge';
import { PROVIDER_LABEL, UnmatchedMark } from '@/components/payments/payment-bits';
import { MatchPanel, UnmatchControl } from '@/components/payments/payment-match';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const payment = await getPayment(id);
  return {
    title: payment
      ? `${payment.providerPaymentId} · Payments · Settled`
      : 'Payment not found · Settled',
  };
}

/**
 * One payment.
 *
 * The read is awaited in the page body rather than inside a `<Suspense>`
 * boundary. `notFound()` thrown after the first flush cannot change a response
 * that has already started streaming, so a missing payment would render the
 * 404 body under an HTTP 200 — measured on the invoice detail page, where every
 * missing id returned 200 until the read moved up here.
 */
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string }>;
}) {
  await requireUser();
  const readOnly = await isReadOnly();

  const { id } = await params;
  const payment = await getPayment(id);
  if (!payment) notFound();

  const { back } = await searchParams;
  const backHref = back ? `/payments?${back}` : '/payments';

  // Only fetched when it can be used: an already-matched payment has no
  // candidate list, and a read-only visitor has nothing to do with one.
  const candidates =
    !readOnly && !payment.invoice ? await getMatchCandidates(payment.id) : [];

  const badge = paymentStatusKey(payment.status);
  const symbol = currencySymbol(payment.currency);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={backHref}
            className="rounded-xs uppercase underline-offset-2 hover:text-ink hover:underline"
          >
            ← Payments
          </Link>
        }
        title={
          <span className="money">
            <span className="currency-mark">{symbol}</span>
            {formatMinorDigits(payment.amountMinor)}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            <StatusBadge status={badge.key} label={badge.label} />
            {payment.invoice === null ? <UnmatchedMark /> : null}
            {/* A destructive-ish control is never adjacent to a routine one —
                §7. Unmatch is the only write on this page for a matched
                payment, and it is separated by a rule. */}
            {!readOnly && payment.invoice ? (
              <>
                <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
                <UnmatchControl
                  paymentId={payment.id}
                  invoiceNumber={payment.invoice.number}
                />
              </>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <Fact label="Received">{formatDateTime(payment.occurredAt)}</Fact>
          <Fact label="Client">
            {payment.client ? (
              <Link
                href={`/clients/${payment.client.id}`}
                className="rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                {payment.client.name}
              </Link>
            ) : (
              <span className="text-ink-muted">Not identified</span>
            )}
          </Fact>
          <Fact label="Provider">{PROVIDER_LABEL[payment.provider] ?? payment.provider}</Fact>
          {/* Collected on the manual form, so it is displayed. A field that is
              gathered and never shown is a field that discards input. */}
          <Fact label="Method">
            {payment.method ?? <span className="text-ink-muted">—</span>}
          </Fact>
          <Fact label="Reference">
            <span className="money">{payment.providerPaymentId}</span>
          </Fact>
          <Fact label="Recorded">{formatDateTime(payment.createdAt)}</Fact>
        </dl>

        {/*
          FX is shown only when the processor actually stored one. An `≈` on a
          figure nobody converted would be a different kind of lie from the one
          the mark exists to prevent.
        */}
        {payment.baseAmountMinor !== null && payment.fxRate ? (
          <p className="rounded-sm border border-line bg-surface-raised px-3 py-2.5 text-small text-ink-secondary">
            Converted at the rate stored when this payment was processed:{' '}
            <span className="money text-ink">
              <span className="currency-mark">≈₦</span>
              {formatMinorDigits(payment.baseAmountMinor)}
            </span>{' '}
            at <span className="money">{payment.fxRate}</span>
            {payment.fxAt ? <> on {formatDateFull(payment.fxAt)}</> : null}. That is
            what it was worth on the day, not what it is worth now.
          </p>
        ) : null}

        {payment.invoice ? (
          <MatchedInvoice payment={payment} />
        ) : (
          <section
            aria-labelledby="match-heading"
            className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4"
          >
            <div className="flex flex-col gap-1">
              <h2 id="match-heading" className="text-h3 text-ink">
                No invoice claims this money
              </h2>
              <p className="text-small text-ink-muted">
                It counts toward nothing until it is matched — not the
                client&rsquo;s balance, not an invoice&rsquo;s status, not the
                dashboard&rsquo;s revenue.
              </p>
            </div>

            {readOnly ? null : (
              <MatchPanel
                paymentId={payment.id}
                candidates={candidates}
                amountMinor={payment.amountMinor}
                currency={payment.currency}
              />
            )}
          </section>
        )}
      </div>
    </>
  );
}

/**
 * The invoice this payment settled, and where this payment sits in the
 * sequence of payments against it.
 *
 * The sequence is the reason this page exists rather than a row in a list. The
 * balance column is computed with a window `filter (where status =
 * 'succeeded')`, so a failed attempt repeats the balance above it instead of
 * moving it — and this payment's own row is marked, because "which of these is
 * the one I clicked" is the first question a reader has.
 */
function MatchedInvoice({
  payment,
}: {
  payment: NonNullable<Awaited<ReturnType<typeof getPayment>>>;
}) {
  const invoice = payment.invoice!;
  const badge = invoiceStatusKey(invoice.status);
  const symbol = currencySymbol(invoice.currency);

  const headCell =
    'bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';
  const cell = 'h-11 px-3 text-small whitespace-nowrap';

  return (
    <section
      aria-labelledby="matched-heading"
      className="rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-line-subtle px-4 py-3">
        <h2 id="matched-heading" className="text-h3 text-ink">
          Settles{' '}
          <Link
            href={`/invoices/${invoice.id}`}
            className="money rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {invoice.number}
          </Link>
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={badge.key} label={badge.label} />
          <p className="text-small text-ink-muted">
            <span className="money">
              {symbol}
              {formatMinorDigits(invoice.paidMinor)}
            </span>{' '}
            of{' '}
            <span className="money">
              {symbol}
              {formatMinorDigits(invoice.amountMinor)}
            </span>{' '}
            received
            {invoice.outstandingMinor > 0n ? (
              <>
                {' · '}
                <span className="money text-ink">
                  {symbol}
                  {formatMinorDigits(invoice.outstandingMinor)}
                </span>{' '}
                still owed
              </>
            ) : null}
          </p>
        </div>
      </header>

      {/* Below md this becomes stacked entries — §8. A five-column money table
          cannot survive 360px, and the balance sequence is the one thing on
          this page that must stay readable there. */}
      <ul className="flex flex-col md:hidden">
        {payment.siblings.map((sibling) => {
          const sBadge = paymentStatusKey(sibling.status);
          return (
            <li
              key={sibling.id}
              className={`flex flex-col gap-1.5 border-t border-line-subtle px-4 py-3 first:border-t-0 ${
                sibling.isThisOne ? 'bg-accent-subtle' : ''
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="money text-small text-ink">
                  {formatDateTime(sibling.occurredAt)}
                </span>
                <StatusBadge status={sBadge.key} label={sBadge.label} />
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-micro text-ink-muted">
                  {sibling.isThisOne ? 'This payment' : PROVIDER_LABEL[sibling.provider]}
                </span>
                {/* Both signals survive the stack: the struck amount and a
                    balance identical to the entry above it. §8. */}
                <span
                  data-card-amount=""
                  className="money min-w-0 text-right text-small whitespace-nowrap text-ink"
                >
                  <span
                    className={
                      sibling.status === 'succeeded' ? '' : 'text-ink-muted line-through'
                    }
                  >
                    {symbol}
                    {formatMinorDigits(sibling.amountMinor)}
                  </span>
                  <span className="block text-micro text-ink-muted">
                    {symbol}
                    {formatMinorDigits(sibling.balanceAfterMinor)} left
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <ScrollCue className="hidden md:block">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className={`${headCell} text-left`}>
                Received
              </th>
              <th scope="col" className={`${headCell} text-left`}>
                Status
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                Amount
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                Balance after
              </th>
              <th scope="col" className={`${headCell} text-left`}>
                Reference
              </th>
            </tr>
          </thead>
          <tbody>
            {payment.siblings.map((sibling) => {
              const sBadge = paymentStatusKey(sibling.status);
              return (
                <tr
                  key={sibling.id}
                  className={`border-t border-line-subtle ${
                    sibling.isThisOne ? 'bg-accent-subtle' : ''
                  }`}
                >
                  <td className={`money ${cell} text-ink-muted`}>
                    {formatDateTime(sibling.occurredAt)}
                    {sibling.isThisOne ? (
                      <span className="ml-2 text-micro uppercase text-accent">this one</span>
                    ) : null}
                  </td>
                  <td className="h-11 px-3">
                    <StatusBadge status={sBadge.key} label={sBadge.label} />
                  </td>
                  <td className={`money ${cell} text-right text-ink`}>
                    {/* A failed attempt is struck through AND repeats the
                        balance beside it. Either signal alone turns this back
                        into a list of dates. */}
                    <span
                      className={
                        sibling.status === 'succeeded' ? '' : 'text-ink-muted line-through'
                      }
                    >
                      {symbol}
                      {formatMinorDigits(sibling.amountMinor)}
                    </span>
                  </td>
                  <td className={`money ${cell} text-right text-ink-secondary`}>
                    {symbol}
                    {formatMinorDigits(sibling.balanceAfterMinor)}
                  </td>
                  <td className={`money ${cell} text-ink-muted`}>
                    {sibling.id === payment.id ? (
                      sibling.providerPaymentId
                    ) : (
                      <Link
                        href={`/payments/${sibling.id}`}
                        className="rounded-xs underline-offset-2 hover:text-ink hover:underline"
                      >
                        {sibling.providerPaymentId}
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollCue>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-micro uppercase text-ink-muted">{label}</dt>
      <dd className="text-small text-ink">{children}</dd>
    </div>
  );
}
