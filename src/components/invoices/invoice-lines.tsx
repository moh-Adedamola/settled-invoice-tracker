import type { InvoiceDetail } from '@/lib/queries/invoices';
import { currencySymbol, formatMinorDigits } from '@/lib/format';
import { formatQuantityDisplay } from '@/lib/money';
import { ScrollCue } from '@/components/ui/scroll-cue';

/**
 * The itemisation, or an honest account of why there isn't one.
 *
 * Line items arrived after the ledger did, and the migration deliberately did
 * not backfill — an invented breakdown of a sent invoice is a worse artefact
 * than no breakdown at all. So an older invoice has zero rows here, and that is
 * a fact about the document rather than a loading failure or an empty state.
 * `<Unitemised>` below says so in those words and still shows the total, which
 * is the figure the invoice was actually issued for.
 */
export function InvoiceLines({ invoice }: { invoice: InvoiceDetail }) {
  const symbol = currencySymbol(invoice.currency);

  if (invoice.lineItems.length === 0) {
    return <Unitemised invoice={invoice} symbol={symbol} />;
  }

  const headCell =
    'bg-surface px-3 py-2.5 text-micro font-medium uppercase whitespace-nowrap text-ink-muted';
  const cell = 'h-11 px-3 text-small';

  return (
    <section
      aria-labelledby="line-items-heading"
      className="rounded-md border border-line bg-surface"
    >
      <header className="border-b border-line-subtle px-4 py-3">
        <h2 id="line-items-heading" className="text-h3 text-ink">
          Line items
        </h2>
      </header>

      <ScrollCue>
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className={`${headCell} w-10 pl-4 text-right`}>
                #
              </th>
              <th scope="col" className={`${headCell} text-left`}>
                Description
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                Qty
              </th>
              <th scope="col" className={`${headCell} text-right`}>
                Unit
              </th>
              <th scope="col" className={`${headCell} pr-5 text-right`}>
                Line total
              </th>
            </tr>
          </thead>

          <tbody>
            {invoice.lineItems.map((line) => (
              <tr key={line.id} className="border-t border-line-subtle">
                <td className={`money ${cell} pl-4 text-right text-ink-muted`}>
                  {line.position}
                </td>
                {/* The only cell allowed to wrap: a description is prose, and
                    truncating it loses what the client is being charged for. */}
                <td className={`${cell} min-w-[220px] text-ink`}>{line.description}</td>
                <td className={`money ${cell} text-right whitespace-nowrap text-ink-secondary`}>
                  {formatQuantityDisplay(line.quantity)}
                </td>
                <td className={`money ${cell} text-right whitespace-nowrap text-ink-secondary`}>
                  <span className="currency-mark">{symbol}</span>
                  {formatMinorDigits(line.unitAmountMinor)}
                </td>
                <td className={`money ${cell} pr-5 text-right whitespace-nowrap text-ink`}>
                  <span className="currency-mark">{symbol}</span>
                  {formatMinorDigits(line.lineAmountMinor)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            {/* §7's double rule: it means "sum above", and this is the one
                place on the page where that is literally true. */}
            <tr className="rule-double">
              <td colSpan={4} className="h-11 px-3 pl-4 text-right text-small text-ink-secondary">
                Invoice total
              </td>
              <td className="money h-11 pr-5 pl-3 text-right text-small whitespace-nowrap text-ink">
                <span className="currency-mark">{symbol}</span>
                {formatMinorDigits(invoice.amountMinor)}
              </td>
            </tr>
          </tfoot>
        </table>
      </ScrollCue>
    </section>
  );
}

/**
 * The pre-itemisation case. Deliberately not the table with no rows in it.
 *
 * The invoice's own `description` is what it was raised against, so that is
 * what shows — the document as it exists, presented as a document rather than
 * as a gap where a table should be.
 */
function Unitemised({ invoice, symbol }: { invoice: InvoiceDetail; symbol: string }) {
  return (
    <section
      aria-labelledby="line-items-heading"
      className="rounded-md border border-line bg-surface"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3">
        <h2 id="line-items-heading" className="text-h3 text-ink">
          Details
        </h2>
        <p className="text-micro uppercase text-ink-muted">Raised before itemisation</p>
      </header>

      <div className="px-4 py-4">
        <p className="max-w-[60ch] text-small text-ink">
          {invoice.description ?? 'No description was recorded for this invoice.'}
        </p>
      </div>

      <div className="rule-double flex items-baseline justify-between gap-4 px-4 py-3">
        <span className="text-small text-ink-secondary">Invoice total</span>
        <span className="money text-small whitespace-nowrap text-ink">
          <span className="currency-mark">{symbol}</span>
          {formatMinorDigits(invoice.amountMinor)}
        </span>
      </div>

      <p className="border-t border-line-subtle px-4 py-2.5 text-micro text-ink-muted">
        This invoice predates per-line itemisation and was not backfilled — a
        reconstructed breakdown would be a guess about a document that has
        already been sent. The total above is the figure it was issued for.
      </p>
    </section>
  );
}
