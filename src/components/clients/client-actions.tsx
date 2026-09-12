'use client';

import { useActionState, useEffect, useState } from 'react';
import Link from 'next/link';

import { archiveClient, unarchiveClient } from '@/app/(app)/clients/actions';
import { EMPTY_FORM_STATE } from '@/lib/invoices/form-state';

/**
 * The client's write controls, in the page header's action cluster (§8).
 *
 * Everything is a POST through a Server Action, never a link — the session
 * cookie is `sameSite: 'lax'`, so a cross-site GET would carry it. Edit is a
 * link because it only navigates.
 *
 * Archive is separated from Edit by a gap and a hairline divider. It is not
 * destructive in the way voiding an invoice is — nothing is lost and it is
 * reversible from the same screen — but it is not routine either, and a row of
 * equal-weight controls says every one of them is the same kind of act.
 *
 * Restoring is not confirmed. A confirmation exists to slow down an act whose
 * consequences are hard to see; putting a client back has none.
 */
export function ClientWriteActions({
  clientId,
  archived,
  invoiceCount,
}: {
  clientId: string;
  archived: boolean;
  invoiceCount: number;
}) {
  const [confirming, setConfirming] = useState(false);

  const routine =
    'inline-flex h-9 items-center rounded-sm border border-line-strong px-3 text-small text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover';

  if (confirming) {
    return (
      <ConfirmArchive
        clientId={clientId}
        invoiceCount={invoiceCount}
        onDone={() => setConfirming(false)}
      />
    );
  }

  if (archived) {
    return (
      <div className="flex items-center gap-2">
        <Link href={`/clients/${clientId}/edit`} className={routine}>
          Edit
        </Link>
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
        <RestoreButton clientId={clientId} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/clients/${clientId}/edit`} className={routine}>
        Edit
      </Link>
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line-strong" />
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex h-9 items-center rounded-sm px-3 text-small text-ink-muted transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover hover:text-ink focus-visible:text-ink"
      >
        Archive
      </button>
    </div>
  );
}

const button =
  'inline-flex h-9 items-center rounded-sm px-3.5 text-small font-medium transition-colors duration-[var(--duration-fast)] ease-standard disabled:cursor-not-allowed disabled:opacity-50';
const ghost = `${button} border border-line-strong text-ink hover:bg-row-hover`;

function RestoreButton({ clientId }: { clientId: string }) {
  const [state, formAction, working] = useActionState(unarchiveClient, EMPTY_FORM_STATE);

  if (state.status === 'error' && state.message) {
    return (
      <p role="alert" className="max-w-[40ch] text-small text-failed">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="clientId" value={clientId} />
      <button type="submit" disabled={working} className={ghost}>
        {working ? 'Working…' : 'Restore'}
      </button>
    </form>
  );
}

/**
 * The confirmation says what archiving does AND what it does not.
 *
 * "Are you sure?" would be the wrong question here: the risk a reader is
 * actually weighing is whether their history survives, and the answer is that
 * it does. Saying so is the difference between a confirmation and a speed bump.
 */
function ConfirmArchive({
  clientId,
  invoiceCount,
  onDone,
}: {
  clientId: string;
  invoiceCount: number;
  onDone: () => void;
}) {
  const [state, formAction, working] = useActionState(archiveClient, EMPTY_FORM_STATE);

  // Close on success: the action revalidates and the server re-renders, but
  // this component's own state survives that, so something has to put the
  // controls back.
  useEffect(() => {
    if (state.status === 'success') onDone();
  }, [state.status, onDone]);

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
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-left text-small text-ink-secondary">
        Archiving takes this client out of the list and out of the picker when you
        raise an invoice.{' '}
        <span className="text-ink">
          Nothing is deleted
        </span>
        {invoiceCount > 0 ? (
          <>
            {' '}— their {invoiceCount === 1 ? 'invoice' : `${invoiceCount} invoices`} and
            every payment against them stay exactly where they are, and keep
            counting toward your totals.
          </>
        ) : (
          <> — and you can restore them from this page at any time.</>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={working} className={`${button} bg-accent text-accent-fg ring-inverse hover:bg-accent-hover`}>
          {working ? 'Working…' : 'Yes, archive'}
        </button>
        <button type="button" onClick={onDone} disabled={working} className={ghost}>
          Cancel
        </button>
      </div>
    </form>
  );
}
