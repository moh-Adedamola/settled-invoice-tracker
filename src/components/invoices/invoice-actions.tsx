'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';

import { markInvoiceSent, voidInvoice } from '@/app/(app)/invoices/actions';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/invoices/form-state';

/* ==========================================================================
   The invoice's write controls.
   ==========================================================================

   ## Where they sit

   In the page header's action cluster (§8), not in the body. The header is
   where a reader looks for "what can I do with this thing", and an invoice's
   actions belong to the invoice rather than to any section of it.

   ## Everything here is a POST

   The session cookie is `sameSite: 'lax'`, which means a cross-site GET carries
   it — so `<a href="/invoices/123/void">` would be a working CSRF endpoint with
   a nice hover state. `lax` does not send the cookie on a cross-site POST,
   which is what makes a form safe and a link not. Edit is a link precisely
   because it only navigates.

   ## Destructive is not adjacent to routine

   Edit and Mark as sent are routine; Void is not, and it is not reversible from
   the UI at all. They are separated by a gap and a hairline divider rather than
   sitting shoulder to shoulder in one run of identical buttons — the same
   reasoning as the line-item remove control, and for the same reason: a row of
   equal-weight controls says every one of them is the same kind of act.

   ## Confirmation replaces the row rather than growing the header

   §7 asks for confirm-in-place. In a header cluster that has to mean replacing
   the controls, not appending to them: a prompt added beside three buttons
   reflows the header and pushes the page down. The whole group swaps for the
   question, so the header keeps its height and the answer is given where the
   question was asked.
   ========================================================================== */

type Pending = 'send' | 'void' | null;

export function InvoiceWriteActions({
  invoiceId,
  status,
  hasLineItems,
  paymentCount,
}: {
  invoiceId: string;
  /** The STORED status. Draft and sent have transitions; the rest are terminal. */
  status: string;
  hasLineItems: boolean;
  paymentCount: number;
}) {
  const [pending, setPending] = useState<Pending>(null);

  const isDraft = status === 'draft';
  const canSend = isDraft;
  const canVoid = (isDraft || status === 'sent') && paymentCount === 0;

  if (pending === 'send') {
    return (
      <ConfirmPanel
        action={markInvoiceSent}
        invoiceId={invoiceId}
        onDone={() => setPending(null)}
        tone="primary"
        confirmLabel="Yes, mark as sent"
        prompt="Marking this as sent locks it. A sent invoice is a document the client
                has a copy of, so it can no longer be edited — only voided and reissued."
      />
    );
  }

  if (pending === 'void') {
    return (
      <ConfirmPanel
        action={voidInvoice}
        invoiceId={invoiceId}
        onDone={() => setPending(null)}
        tone="danger"
        confirmLabel="Yes, void it"
        /*
         * Two genuinely different acts, so two different sentences. Voiding a
         * draft cancels something nobody has seen. Voiding a sent invoice
         * cancels a document that is already in someone's inbox, and this app
         * cannot tell them — saying so is the difference between a warning and
         * a formality.
         */
        prompt={
          isDraft
            ? 'This draft has not been sent, so voiding it costs nothing. It stays on the ledger marked void, and its number is not reused.'
            : 'This invoice has already been sent — the client has a copy of it. Voiding it cancels the invoice in your books but does not tell them, so send a note or a credit note as well.'
        }
      />
    );
  }

  const routine =
    'inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-small text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-40';

  // A terminal invoice has no transitions; say why rather than showing nothing
  // where a reader expects a control.
  if (!canSend && !canVoid) {
    return status === 'sent' && paymentCount > 0 ? (
      <p className="max-w-[34ch] text-micro text-ink-muted">
        Payments are recorded against this invoice, so it can no longer be voided
        here.
      </p>
    ) : null;
  }

  return (
    <div className="flex items-center gap-2">
      {isDraft ? (
        <Link href={`/invoices/${invoiceId}/edit`} className={routine}>
          Edit
        </Link>
      ) : null}

      {canSend ? (
        <button
          type="button"
          onClick={() => setPending('send')}
          disabled={!hasLineItems}
          title={hasLineItems ? undefined : 'Add a line item first'}
          className={
            hasLineItems
              ? 'ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active'
              : routine
          }
        >
          Mark as sent
        </button>
      ) : null}

      {canVoid && (canSend || isDraft) ? (
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
      ) : null}

      {canVoid ? (
        <button
          type="button"
          onClick={() => setPending('void')}
          className="inline-flex h-9 items-center rounded-sm px-3 text-small text-ink-muted transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-failed-bg hover:text-failed focus-visible:text-failed"
        >
          Void
        </button>
      ) : null}
    </div>
  );
}

/**
 * The question, in the space the controls occupied.
 *
 * A refusal from the server lands here too — `voidInvoice` returns a message
 * naming the payments rather than a generic failure, and it is shown where the
 * reader was already looking.
 */
function ConfirmPanel({
  action,
  invoiceId,
  onDone,
  prompt,
  confirmLabel,
  tone,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  invoiceId: string;
  onDone: () => void;
  prompt: string;
  confirmLabel: string;
  tone: 'primary' | 'danger';
}) {
  const [state, formAction, working] = useActionState(action, EMPTY_FORM_STATE);

  /*
   * Close on success.
   *
   * The action revalidates and the server re-renders the page, but this is a
   * client component and its `pending` state survives that — so without this
   * the confirmation stayed on screen after the invoice had already been sent,
   * offering to send it again. The re-render is what changes the page; this is
   * what puts the control back.
   */
  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state.status, onDone]);

  const base =
    'inline-flex h-9 items-center rounded-sm px-3.5 text-small font-medium transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50';
  const primary = `ring-inverse ${base} bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active`;
  const danger = `${base} border border-failed-line bg-failed-bg text-failed`;
  const ghost = `${base} border border-line-strong text-ink hover:bg-row-hover`;

  if (state.status === 'error' && state.message) {
    return (
      <div className="flex max-w-[52ch] flex-col items-end gap-2">
        <p
          role="alert"
          className="rounded-sm border border-failed-line border-l-[3px] border-l-failed bg-failed-bg px-3 py-2.5 text-left text-small text-failed"
        >
          {state.message}
        </p>
        <button type="button" onClick={onDone} className={ghost}>
          Close
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex max-w-[52ch] flex-col items-end gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p className="text-left text-small text-ink-secondary">{prompt}</p>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={working} className={tone === 'primary' ? primary : danger}>
          {working ? 'Working…' : confirmLabel}
        </button>
        <button type="button" onClick={onDone} disabled={working} className={ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
