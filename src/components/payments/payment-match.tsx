'use client';

import { useActionState, useEffect, useState } from 'react';

import { matchPayment, unmatchPayment } from '@/app/(app)/payments/actions';
import type { MatchCandidate } from '@/lib/queries/payments';
import { EMPTY_FORM_STATE } from '@/lib/invoices/form-state';
import { currencySymbol, formatDateFull, formatMinorDigits } from '@/lib/format';
import { StatusBadge, invoiceStatusKey } from '@/components/ui/status-badge';

const button =
  'inline-flex h-9 items-center rounded-sm px-3.5 text-small font-medium transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50';
const ghost = `${button} border border-line-strong text-ink hover:bg-row-hover`;
const primary = `${button} bg-accent text-accent-fg ring-inverse hover:bg-accent-hover`;

const money = (minor: bigint, currency: string) => (
  <span className="money whitespace-nowrap">
    <span className="currency-mark">{currencySymbol(currency)}</span>
    {formatMinorDigits(minor)}
  </span>
);

/**
 * Placing an unmatched payment against an invoice.
 *
 * ## Two steps, not one
 *
 * Selecting a candidate does not submit. The confirmation step exists because
 * one of these choices — matching to an invoice that is already settled — has a
 * consequence the row itself does not show, and a single-click list would let
 * someone commit it while scanning. Every other candidate confirms too, so the
 * overpay case is not the one that behaves oddly.
 *
 * ## Currency is absent, not disabled
 *
 * Invoices in another currency never reach this list — `getMatchCandidates`
 * filters them out in SQL. A disabled row advertising an invoice you may not
 * pick would invite exactly the question the rule exists to close.
 */
export function MatchPanel({
  paymentId,
  candidates,
  amountMinor,
  currency,
}: {
  paymentId: string;
  candidates: MatchCandidate[];
  amountMinor: bigint;
  currency: string;
}) {
  const [chosen, setChosen] = useState<MatchCandidate | null>(null);

  if (candidates.length === 0) {
    return (
      <p className="rounded-sm border border-line bg-surface-raised px-3 py-2.5 text-small text-ink-secondary">
        No invoice in {currency} can take this payment. Every candidate is either
        voided, still a draft, or in another currency — matching across
        currencies would mean inventing an exchange rate nobody chose, so it is
        refused rather than offered.
      </p>
    );
  }

  if (chosen) {
    return (
      <ConfirmMatch
        paymentId={paymentId}
        candidate={chosen}
        amountMinor={amountMinor}
        currency={currency}
        onCancel={() => setChosen(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-ink-secondary">
        Invoices in {currency} this payment could settle — the client already on
        the payment first, then by how close the balance is to{' '}
        {money(amountMinor, currency)}.
      </p>

      <ul className="overflow-hidden rounded-md border border-line bg-surface">
        {candidates.map((candidate) => {
          const badge = invoiceStatusKey(candidate.status);
          const exact = candidate.amountGapMinor === 0n;
          return (
            <li key={candidate.id} className="border-t border-line-subtle first:border-t-0">
              <button
                type="button"
                onClick={() => setChosen(candidate)}
                className="flex w-full flex-col gap-1.5 px-4 py-3 text-left transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="money text-small text-ink">{candidate.number}</span>
                  <div className="flex items-center gap-2">
                    {exact ? (
                      <span className="rounded-xs border border-l-[3px] border-paid-line border-l-paid bg-paid-bg px-1.5 py-0.5 text-micro font-medium uppercase text-paid">
                        Settles exactly
                      </span>
                    ) : null}
                    <StatusBadge status={badge.key} label={badge.label} />
                  </div>
                </div>

                <p className="text-small text-ink-secondary">
                  {candidate.clientName}
                  {candidate.sameClient ? (
                    <span className="text-ink-muted"> · already on this payment</span>
                  ) : null}
                </p>

                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-micro text-ink-muted">
                    {candidate.issuedAt ? <>Issued {formatDateFull(candidate.issuedAt)}</> : 'Not issued'}
                    {candidate.dueAt ? <> · due {formatDateFull(candidate.dueAt)}</> : null}
                  </span>
                  <span className="text-small text-ink">
                    {candidate.outstandingMinor > 0n ? (
                      <>{money(candidate.outstandingMinor, candidate.currency)} outstanding</>
                    ) : (
                      <span className="text-refunded">Already settled in full</span>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The confirmation.
 *
 * For an ordinary match this restates the pairing. For an invoice that is
 * already settled it says so in as many words, and says what the result will
 * be — an overpaid invoice — because that is the fact the candidate row cannot
 * carry and the reason this step exists at all.
 *
 * It does not refuse. A duplicate transfer is a real event; refusing to place
 * it leaves the money orphaned with nowhere to go, which is worse than an
 * overpaid invoice the client list already renders in the refunded treatment.
 */
function ConfirmMatch({
  paymentId,
  candidate,
  amountMinor,
  currency,
  onCancel,
}: {
  paymentId: string;
  candidate: MatchCandidate;
  amountMinor: bigint;
  currency: string;
  onCancel: () => void;
}) {
  const [state, formAction, working] = useActionState(matchPayment, EMPTY_FORM_STATE);

  // Close on success. The action revalidates and the server re-renders, but
  // this component's own state survives that, so something has to put it back.
  useEffect(() => {
    if (state.status === 'success') onCancel();
  }, [state.status, onCancel]);

  const settled = candidate.outstandingMinor === 0n;
  const over = amountMinor > candidate.outstandingMinor;

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-4"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="invoiceId" value={candidate.id} />

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="rounded-sm border border-failed-line border-l-[3px] border-l-failed bg-failed-bg px-3 py-2.5 text-small text-failed"
        >
          {state.message}
        </p>
      ) : null}

      <p className="text-small text-ink">
        Match {money(amountMinor, currency)} to{' '}
        <span className="money">{candidate.number}</span> for {candidate.clientName}.
      </p>

      {settled ? (
        <p className="rounded-sm border border-refunded-line border-l-[3px] border-l-refunded bg-refunded-bg px-3 py-2.5 text-small text-refunded">
          <span className="font-medium">{candidate.number} is already settled in full.</span>{' '}
          Matching this payment to it will make the invoice overpaid by{' '}
          {money(amountMinor, currency)} — the amount received will exceed the
          amount invoiced, and it will show that way on the client&rsquo;s record.
          That is the right outcome for a duplicate transfer; it is the wrong one
          if this money was meant for a different invoice.
        </p>
      ) : over ? (
        <p className="rounded-sm border border-refunded-line border-l-[3px] border-l-refunded bg-refunded-bg px-3 py-2.5 text-small text-refunded">
          This payment is larger than the {money(candidate.outstandingMinor, candidate.currency)}{' '}
          still outstanding, so {candidate.number} will end up overpaid by{' '}
          {money(amountMinor - candidate.outstandingMinor, currency)}.
        </p>
      ) : (
        <p className="text-small text-ink-secondary">
          {candidate.number} will go from{' '}
          {money(candidate.outstandingMinor, candidate.currency)} outstanding to{' '}
          {money(candidate.outstandingMinor - amountMinor, candidate.currency)}.
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={working} className={primary}>
          {working ? 'Matching…' : settled || over ? 'Match anyway' : 'Match'}
        </button>
        <button type="button" onClick={onCancel} disabled={working} className={ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Detaching a payment from its invoice.
 *
 * Confirmed, but lightly: it is reversible from the same screen and nothing is
 * destroyed. What the confirmation is for is the invoice — detaching moves an
 * invoice's status back down, and that consequence is one screen away.
 */
export function UnmatchControl({
  paymentId,
  invoiceNumber,
}: {
  paymentId: string;
  invoiceNumber: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, working] = useActionState(unmatchPayment, EMPTY_FORM_STATE);

  /*
   * Closing on success is a derivation, not an effect.
   *
   * `ConfirmMatch` above has to call back into a parent, so it uses one. Here
   * the state is local and the answer is already in `state.status`, so
   * `setConfirming(false)` in an effect would be a cascading render to compute
   * something a boolean already says — and eslint's `set-state-in-effect` is
   * right to refuse it.
   *
   * In practice this control unmounts on success anyway: once the payment has
   * no invoice the page renders the match panel instead. Deriving means the
   * panel still collapses correctly if it does not.
   */
  const showConfirm = confirming && state.status !== 'success';

  if (state.status === 'error' && state.message) {
    return (
      <div className="flex max-w-[48ch] flex-col items-end gap-2">
        <p
          role="alert"
          className="rounded-sm border border-failed-line border-l-[3px] border-l-failed bg-failed-bg px-3 py-2.5 text-left text-small text-failed"
        >
          {state.message}
        </p>
        <button type="button" onClick={() => setConfirming(false)} className={ghost}>
          Close
        </button>
      </div>
    );
  }

  if (!showConfirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center rounded-sm px-3 text-small text-ink-muted transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover hover:text-ink focus-visible:text-ink"
      >
        Unmatch
      </button>
    );
  }

  return (
    <form action={formAction} className="flex max-w-[52ch] flex-col items-end gap-2">
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-left text-small text-ink-secondary">
        Detaching this payment from <span className="money">{invoiceNumber}</span>{' '}
        puts that money back in the unmatched queue and recalculates the
        invoice&rsquo;s balance <span className="text-ink">upward</span> — if it
        was paid, it will not be any more.{' '}
        <span className="text-ink">Nothing is deleted</span>, and you can match
        it again from this page.
      </p>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={working} className={primary}>
          {working ? 'Working…' : 'Yes, unmatch'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={working}
          className={ghost}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
