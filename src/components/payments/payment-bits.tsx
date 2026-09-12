import type { PaymentProvider } from '@/lib/db';

export const PROVIDER_LABEL: Record<PaymentProvider, string> = {
  stripe: 'Stripe',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
  manual: 'Manual',
};

/**
 * Money no invoice claims.
 *
 * Marked, not left blank. An empty Invoice cell reads as missing data — the
 * kind of thing a person assumes will fill itself in — whereas this says the
 * record is complete and the work is outstanding. It is the only row state on
 * this page that needs a person to do something, and the whole brief for the
 * list is that such rows are findable without filtering for them.
 *
 * §3.3: the marker travels with the colour, so this is legible without it.
 * `pending` is the right token rather than `failed` — nothing has gone wrong,
 * the money arrived; it is waiting to be placed.
 */
export function UnmatchedMark() {
  return (
    <span className="inline-flex items-center gap-1 rounded-xs border border-l-[3px] border-pending-line border-l-pending bg-pending-bg px-1.5 py-0.5 text-micro font-medium uppercase whitespace-nowrap text-pending">
      <span aria-hidden="true" className="text-[10px] leading-none">
        ◐
      </span>
      Unmatched
    </span>
  );
}
