import type { ProviderTotal } from '@/lib/queries/dashboard';
import { currencySymbol, formatMinorDigits } from '@/lib/format';

/**
 * Magnitude by category, four fixed categories — horizontal bars with direct
 * labels, not a pie. Every series is labelled in text, so identity never rests
 * on colour alone and no legend box is needed.
 *
 * Colours are pinned per provider (§4). A provider with zero revenue still
 * renders, because dropping it would shift the colours of the survivors.
 */
const BAR_COLOR: Record<string, string> = {
  stripe: 'var(--chart-stripe)',
  paystack: 'var(--chart-paystack)',
  flutterwave: 'var(--chart-flutterwave)',
  manual: 'var(--chart-manual)',
};

const LABEL: Record<string, string> = {
  stripe: 'Stripe',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
  manual: 'Manual',
};

export function ProviderBreakdown({ providers }: { providers: ProviderTotal[] }) {
  const max = providers.reduce((m, p) => (p.totalMinor > m ? p.totalMinor : m), 0n);

  return (
    <section
      aria-label="Revenue by provider"
      className="flex flex-col rounded-md border border-line bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-line-subtle px-4 py-3">
        <h2 className="text-h3 text-ink">By provider</h2>
        <p className="text-small text-ink-muted">Last 6 months</p>
      </div>

      <ul className="flex flex-col gap-4 p-4">
        {providers.map((provider) => {
          // Percentage of the largest bar. Integer maths on bigint, then a
          // single conversion for the CSS width — never money arithmetic.
          const pct =
            max === 0n ? 0 : Number((provider.totalMinor * 1000n) / max) / 10;

          return (
            <li key={provider.provider} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 text-small text-ink">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: BAR_COLOR[provider.provider] }}
                  />
                  {LABEL[provider.provider] ?? provider.provider}
                </span>
                <span className="money text-small whitespace-nowrap text-ink">
                  <span className="currency-mark">
                    {currencySymbol(provider.currency)}
                  </span>
                  {formatMinorDigits(provider.totalMinor)}
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-xs bg-surface-inset">
                <div
                  className="h-full rounded-xs"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: BAR_COLOR[provider.provider],
                  }}
                />
              </div>

              <p className="text-small text-ink-muted">
                {provider.paymentCount} payment
                {provider.paymentCount === 1 ? '' : 's'}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
