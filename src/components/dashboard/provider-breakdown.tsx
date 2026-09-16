import type { ProviderTotal } from '@/lib/queries/dashboard';
import { currencySymbol, formatMinorDigits } from '@/lib/format';
import { DeskSection } from './desk-section';

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

  /*
    Desk work. Which gateway brought what over six months is reference — it
    settles no question a reader has on a phone, and it measured ~460px sitting
    above the unmatched queue, which is the one block that IS a to-do list.
    Collapsed below md, unchanged above it. See DeskSection.

    The collapsed row still names the leader and the total, so the reader can
    tell whether opening it would tell them anything.
  */
  const leader = providers.reduce(
    (best, p) => (p.totalMinor > best.totalMinor ? p : best),
    providers[0],
  );

  return (
    <DeskSection
      title="By provider"
      aside="Last 6 months"
      summary={
        providers.length === 0 || !leader || leader.totalMinor === 0n ? (
          'No payments in the last 6 months'
        ) : (
          <>
            {providers.length} providers · {LABEL[leader.provider]} leads with{' '}
            <span className="money">
              {currencySymbol(leader.currency)}
              {formatMinorDigits(leader.totalMinor, leader.currency)}
            </span>
          </>
        )
      }
    >
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
                  {formatMinorDigits(provider.totalMinor, provider.currency)}
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
    </DeskSection>
  );
}
