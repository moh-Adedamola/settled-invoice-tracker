import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { isReadOnly, requireUser } from '@/lib/auth/guard';
import { getClient } from '@/lib/queries/clients';
import { currencySymbol, formatDateFull, formatDateTime, formatMinorDigits } from '@/lib/format';
import { firstValue, type RawSearchParams } from '@/lib/search-params';
import { ClientWriteActions } from '@/components/clients/client-actions';
import { ApproxBase, CurrencyBreakdown } from '@/components/clients/client-money';
import { ArchivedMark } from '@/components/clients/clients-table';
import { PageHeader } from '@/components/shell/page-header';
import { ScrollCue } from '@/components/ui/scroll-cue';
import { StatusBadge, invoiceStatusKey, paymentStatusKey } from '@/components/ui/status-badge';

/**
 * The tab carries the client's name. Deliberately no figures: a browser title
 * is the part of this page that leaks into screen shares and bookmark bars.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const client = await getClient(id);
  return { title: client ? `${client.name} · Settled` : 'Client · Settled' };
}

export const dynamic = 'force-dynamic';

/** Keys the list understands; anything else in `back` is dropped. */
const LIST_PARAM_KEYS = ['q', 'archived', 'sort', 'dir', 'page'];

function backHref(carrier: string | undefined): string {
  if (!carrier) return '/clients';
  const incoming = new URLSearchParams(carrier);
  const clean = new URLSearchParams();
  for (const key of LIST_PARAM_KEYS) {
    for (const value of incoming.getAll(key)) if (value !== '') clean.append(key, value);
  }
  const query = clean.toString();
  return query ? `/clients?${query}` : '/clients';
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  await requireUser();

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const back = backHref(firstValue(query.back));

  // Read here, not inside a Suspense boundary: a boundary lets Next flush the
  // shell before the child resolves, so notFound() would land under a 200.
  const client = await getClient(id);
  if (!client) notFound();

  const readOnly = await isReadOnly();
  const providers = Object.entries(client.providerCustomerIds);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link
            href={back}
            className="rounded-xs uppercase underline-offset-2 hover:text-ink hover:underline"
          >
            ← Clients
          </Link>
        }
        title={client.name}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {client.archivedAt ? <ArchivedMark /> : null}
            {readOnly ? null : (
              <ClientWriteActions
                clientId={client.id}
                archived={client.archivedAt !== null}
                invoiceCount={client.invoiceCount}
              />
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        {client.archivedAt ? (
          <p className="rounded-sm border border-void-line border-l-[3px] border-l-void bg-void-bg px-3 py-2.5 text-small text-void">
            Archived on {formatDateFull(client.archivedAt)}. They no longer appear when
            raising an invoice; everything below is unchanged and still counts toward your
            totals.
          </p>
        ) : null}

        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <Fact label="Email">
            {client.email ? (
              <a
                href={`mailto:${client.email}`}
                className="money rounded-xs text-accent underline underline-offset-2 hover:text-accent-hover"
              >
                {client.email}
              </a>
            ) : (
              <span className="text-ink-muted">Not on file</span>
            )}
          </Fact>
          <Fact label="Phone">
            {client.phone ? (
              <span className="money">{client.phone}</span>
            ) : (
              <span className="text-ink-muted">Not on file</span>
            )}
          </Fact>
          <Fact label="Client since">
            <span className="money">{formatDateFull(client.createdAt)}</span>
          </Fact>
          <Fact label="Last activity">
            <span className="money">
              {client.lastActivityAt ? formatDateFull(client.lastActivityAt) : 'None yet'}
            </span>
          </Fact>
        </dl>

        {client.notes ? (
          <p className="max-w-[70ch] text-small text-ink-secondary">{client.notes}</p>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Summary first in the DOM, moved right at lg — on a phone "what do
              they owe" is what the reader came for. */}
          <div className="lg:order-2 lg:w-[320px] lg:shrink-0">
            <Summary client={client} providers={providers} />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-6 lg:order-1">
            <Invoices client={client} />
            <Payments client={client} />
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

function Summary({
  client,
  providers,
}: {
  client: Awaited<ReturnType<typeof getClient>> & object;
  providers: [string, string][];
}) {
  const settled = client.base.outstandingMinor === 0n;

  return (
    <section
      aria-labelledby="client-summary-heading"
      className="rounded-md border border-line bg-surface-raised"
    >
      <header className="border-b border-line-subtle px-4 py-3">
        <h2 id="client-summary-heading" className="text-h3 text-ink">
          Summary
        </h2>
      </header>

      <dl className="flex flex-col gap-3 px-4 py-4">
        <Row label="Invoices">
          <span className="money text-small text-ink">{client.invoiceCount}</span>
        </Row>
        <Row label="Invoiced">
          <CurrencyBreakdown
            totals={client.totals}
            field="invoicedMinor"
            className="text-small text-ink"
          />
        </Row>
        <Row label="Paid">
          <CurrencyBreakdown
            totals={client.totals}
            field="paidMinor"
            className="text-small text-paid"
          />
        </Row>

        <div className="rule-double flex items-baseline justify-between gap-4 pt-3">
          <dt className="text-small text-ink-secondary">Outstanding</dt>
          <dd className="text-right">
            <CurrencyBreakdown
              totals={client.totals}
              field="outstandingMinor"
              className={`text-h3 ${settled ? 'text-paid' : 'text-ink'}`}
            />
          </dd>
        </div>
      </dl>

      {/* The converted summary, marked. Shown only when there is more than one
          currency — with a single base-currency client it would be the identity
          dressed up as an estimate. */}
      {client.totals.length > 1 ? (
        <div className="border-t border-line-subtle px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-small text-ink-secondary">
              Outstanding, {client.base.currency}
            </span>
            <ApproxBase
              minor={client.base.outstandingMinor}
              currency={client.base.currency}
              incomplete={client.baseIncomplete}
              className="text-small text-ink-secondary"
            />
          </div>
          <p className="mt-2 text-micro text-ink-muted">
            Indicative, at the latest rate. Each invoice settles in its own currency;
            this is what the balance is worth today, not what will be received.
            {client.baseIncomplete
              ? ' One currency here has no rate on file and is not counted.'
              : ''}
          </p>
        </div>
      ) : null}

      {/*
        Set by the event processor when a webhook's customer is matched to this
        client. Read-only by design — a hand-typed value would silently
        mis-route real money — but shown, because a mapping nobody can see is a
        mapping nobody can debug.
      */}
      {providers.length > 0 ? (
        <div className="border-t border-line-subtle px-4 py-3">
          <p className="text-micro uppercase text-ink-muted">Provider customer ids</p>
          <ul className="mt-2 flex flex-col gap-1">
            {providers.map(([provider, value]) => (
              <li key={provider} className="flex items-baseline justify-between gap-3">
                <span className="text-small text-ink-secondary">{provider}</span>
                <span className="money text-micro break-all text-ink-muted">{value}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-micro text-ink-muted">
            Set automatically when a payment from this customer is matched. Not editable.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-small text-ink-secondary">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/**
 * The client's invoices, in the ledger's own row treatment rather than a new
 * one: number in Plex Mono, status through the STATUS map so colour is never
 * available without its marker, money right-aligned and tabular.
 */
function Invoices({ client }: { client: Awaited<ReturnType<typeof getClient>> & object }) {
  const headCell =
    'bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';
  const cell = 'h-11 px-3 text-small whitespace-nowrap';

  return (
    <section
      aria-labelledby="client-invoices-heading"
      className="rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3">
        <h2 id="client-invoices-heading" className="text-h3 text-ink">
          Invoices
        </h2>
        {client.invoices.length > 0 ? (
          <Link
            href={`/invoices?client=${client.id}`}
            className="rounded-xs text-small text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            Open in the ledger
          </Link>
        ) : null}
      </header>

      {client.invoices.length === 0 ? (
        <p className="px-4 py-8 text-small text-ink-muted">
          Nothing has been invoiced to this client yet.
        </p>
      ) : (
        <>
          <ul className="md:hidden">
            {client.invoices.map((invoice) => {
              const badge = invoiceStatusKey(invoice.status);
              return (
                <li key={invoice.id} className="border-t border-line-subtle first:border-t-0">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="flex flex-col gap-1.5 px-4 py-3 transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="money text-small text-ink">{invoice.number}</span>
                      <StatusBadge status={badge.key} label={badge.label} />
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-micro text-ink-muted">
                        {invoice.daysOverdue > 0 ? (
                          <span className="text-overdue">{invoice.daysOverdue} days overdue</span>
                        ) : invoice.dueAt ? (
                          <>Due {formatDateFull(invoice.dueAt)}</>
                        ) : (
                          'Not issued'
                        )}
                      </span>
                      <span data-card-amount="" className="money shrink-0 text-small text-ink">
                        <span className="currency-mark">{currencySymbol(invoice.currency)}</span>
                        {formatMinorDigits(invoice.amountMinor)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          <ScrollCue className="hidden md:block">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={`${headCell} pl-4 text-left`}>Invoice</th>
                  <th scope="col" className={`${headCell} text-left`}>Status</th>
                  <th scope="col" className={`${headCell} text-left`}>Issued</th>
                  <th scope="col" className={`${headCell} text-left`}>Due</th>
                  <th scope="col" className={`${headCell} text-right`}>Outstanding</th>
                  <th scope="col" className={`${headCell} pr-5 text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {client.invoices.map((invoice) => {
                  const badge = invoiceStatusKey(invoice.status);
                  return (
                    <tr
                      key={invoice.id}
                      className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
                    >
                      <td className={`money ${cell} pl-4 text-ink`}>
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="rounded-xs underline-offset-2 hover:underline"
                        >
                          {invoice.number}
                        </Link>
                      </td>
                      <td className="h-11 px-3">
                        <StatusBadge status={badge.key} label={badge.label} />
                      </td>
                      <td className={`money ${cell} text-ink-muted`}>
                        {invoice.issuedAt ? formatDateFull(invoice.issuedAt) : '—'}
                      </td>
                      <td className={`money ${cell} ${invoice.daysOverdue > 0 ? 'text-overdue' : 'text-ink-muted'}`}>
                        {invoice.dueAt ? formatDateFull(invoice.dueAt) : '—'}
                      </td>
                      <td className={`money ${cell} text-right text-ink-secondary`}>
                        {invoice.outstandingMinor > 0n ? (
                          <>
                            <span className="currency-mark">{currencySymbol(invoice.currency)}</span>
                            {formatMinorDigits(invoice.outstandingMinor)}
                          </>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      <td className={`money ${cell} pr-5 text-right text-ink`}>
                        <span className="currency-mark">{currencySymbol(invoice.currency)}</span>
                        {formatMinorDigits(invoice.amountMinor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollCue>
        </>
      )}
    </section>
  );
}

function Payments({ client }: { client: Awaited<ReturnType<typeof getClient>> & object }) {
  const headCell =
    'bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';
  const cell = 'h-11 px-3 text-small whitespace-nowrap';

  return (
    <section
      aria-labelledby="client-payments-heading"
      className="rounded-md border border-line bg-surface"
    >
      <header className="border-b border-line-subtle px-4 py-3">
        <h2 id="client-payments-heading" className="text-h3 text-ink">
          Payment history
        </h2>
      </header>

      {client.payments.length === 0 ? (
        <p className="px-4 py-8 text-small text-ink-muted">
          No payment has been recorded from this client.
        </p>
      ) : (
        <>
          <ul className="md:hidden">
            {client.payments.map((payment) => {
              const badge = paymentStatusKey(payment.status);
              const counts = payment.status === 'succeeded';
              return (
                <li
                  key={payment.id}
                  className="flex flex-col gap-1.5 border-t border-line-subtle px-4 py-3 first:border-t-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="money text-small text-ink-secondary">
                      {formatDateTime(payment.occurredAt)}
                    </span>
                    <StatusBadge status={badge.key} label={badge.label} />
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-small text-ink">
                      {payment.invoiceNumber ? (
                        <Link
                          href={`/invoices/${payment.invoiceId}`}
                          className="money rounded-xs text-accent underline underline-offset-2"
                        >
                          {payment.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-ink-muted">Unmatched</span>
                      )}
                    </span>
                    <span
                      data-card-amount=""
                      className={`money shrink-0 text-small ${counts ? 'text-ink' : 'text-ink-muted line-through'}`}
                    >
                      <span className="currency-mark">{currencySymbol(payment.currency)}</span>
                      {formatMinorDigits(payment.amountMinor)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <ScrollCue className="hidden md:block">
            <table className="w-full min-w-[620px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={`${headCell} pl-4 text-left`}>Date</th>
                  <th scope="col" className={`${headCell} text-left`}>Invoice</th>
                  <th scope="col" className={`${headCell} text-left`}>Provider</th>
                  <th scope="col" className={`${headCell} text-left`}>Status</th>
                  <th scope="col" className={`${headCell} pr-5 text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {client.payments.map((payment) => {
                  const badge = paymentStatusKey(payment.status);
                  const counts = payment.status === 'succeeded';
                  return (
                    <tr
                      key={payment.id}
                      className="group border-t border-line-subtle transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
                    >
                      <td className={`money ${cell} pl-4 text-ink-secondary`}>
                        {formatDateTime(payment.occurredAt)}
                      </td>
                      <td className={`money ${cell}`}>
                        {payment.invoiceNumber ? (
                          <Link
                            href={`/invoices/${payment.invoiceId}`}
                            className="rounded-xs text-accent underline-offset-2 hover:underline"
                          >
                            {payment.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="text-ink-muted">Unmatched</span>
                        )}
                      </td>
                      <td className={`${cell} text-ink`}>
                        {payment.provider}
                        {payment.method ? (
                          <span className="text-ink-muted"> · {payment.method}</span>
                        ) : null}
                      </td>
                      <td className="h-11 px-3">
                        <StatusBadge status={badge.key} label={badge.label} />
                      </td>
                      <td
                        className={`money ${cell} pr-5 text-right ${
                          counts ? 'text-ink' : 'text-ink-muted line-through'
                        }`}
                      >
                        <span className="currency-mark">{currencySymbol(payment.currency)}</span>
                        {formatMinorDigits(payment.amountMinor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollCue>
        </>
      )}
    </section>
  );
}
