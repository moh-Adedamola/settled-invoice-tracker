'use client';

import { useActionState, useState } from 'react';

import { markInvoiceSent, voidInvoice } from '@/app/(app)/invoices/actions';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/invoices/form-state';

/* ==========================================================================
   The write controls on the invoice detail page.
   ==========================================================================

   Every one of these is a POST through a Server Action, never a link. The
   session cookie is `sameSite: 'lax'`, which means a cross-site GET carries it
   — so `<a href="/invoices/123/void">` would be a working CSRF endpoint with a
   nice hover state. `sameSite: 'lax'` does NOT send the cookie on a cross-site
   POST, which is what makes the form safe.

   Both are two-step. Marking an invoice as sent is the transition that makes it
   uneditable, and voiding is not reversible from the UI at all; neither should
   be one stray tap away on a phone. The confirmation is inline rather than a
   modal, because §7 gives modals to things that need focus trapping and an
   escape path, and a two-button row needs neither.
   ========================================================================== */

export function InvoiceWriteActions({
  invoiceId,
  status,
  hasLineItems,
  paymentCount,
}: {
  invoiceId: string;
  /** The STORED status. Draft and sent are transitions; the rest are terminal. */
  status: string;
  hasLineItems: boolean;
  paymentCount: number;
}) {
  const canSend = status === 'draft';
  const canVoid = (status === 'draft' || status === 'sent') && paymentCount === 0;

  // Nothing to offer: a paid or void invoice has no transition from here.
  if (!canSend && !canVoid) {
    return status === 'sent' && paymentCount > 0 ? (
      <p className="text-micro text-ink-muted">
        This invoice has payments against it, so it can no longer be voided here.
      </p>
    ) : null;
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {canSend ? (
        <ConfirmAction
          action={markInvoiceSent}
          invoiceId={invoiceId}
          label="Mark as sent"
          disabled={!hasLineItems}
          disabledReason="Add a line item first."
          confirmLabel="Yes, mark as sent"
          prompt="Once sent, this invoice can no longer be edited — the client has a copy of it."
          tone="primary"
        />
      ) : null}

      {canVoid ? (
        <ConfirmAction
          action={voidInvoice}
          invoiceId={invoiceId}
          label="Void"
          confirmLabel="Yes, void it"
          prompt="Voiding cancels this invoice. It stays on the ledger, marked void."
          tone="danger"
        />
      ) : null}
    </div>
  );
}

function ConfirmAction({
  action,
  invoiceId,
  label,
  confirmLabel,
  prompt,
  tone,
  disabled = false,
  disabledReason,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  label: string;
  confirmLabel: string;
  prompt: string;
  tone: 'primary' | 'danger';
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [confirming, setConfirming] = useState(false);

  const base =
    'inline-flex h-9 items-center rounded-sm px-3.5 text-small font-medium transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50';
  const primary = `ring-inverse ${base} bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active`;
  const danger = `${base} border border-failed-line bg-failed-bg text-failed hover:bg-failed-bg`;
  const ghost = `${base} border border-line-strong text-ink hover:bg-row-hover`;

  if (state.status === 'error' && state.message) {
    return (
      <div className="flex max-w-[46ch] flex-col gap-2">
        <p
          role="alert"
          className="rounded-sm border border-failed-line border-l-[3px] border-l-failed bg-failed-bg px-3 py-2.5 text-small text-failed"
        >
          {state.message}
        </p>
        <button type="button" onClick={() => setConfirming(false)} className={ghost}>
          Close
        </button>
      </div>
    );
  }

  if (!confirming) {
    return (
      <span className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={disabled}
          className={tone === 'primary' ? primary : danger}
        >
          {label}
        </button>
        {disabled && disabledReason ? (
          <span className="text-micro text-ink-muted">{disabledReason}</span>
        ) : null}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex max-w-[46ch] flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p className="text-small text-ink-secondary">{prompt}</p>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className={tone === 'primary' ? primary : danger}
        >
          {pending ? 'Working…' : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className={ghost}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
