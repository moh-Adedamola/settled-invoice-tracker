'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';

import { assertCanWrite, AuthorizationError } from '@/lib/auth/guard';
import type { FormState } from '@/lib/invoices/form-state';
import { dateFromForm } from '@/lib/invoices/form-schema';
import { parseDecimalToMinor } from '@/lib/money';
import {
  composeMethod,
  manualPaymentSchema,
  type ManualMethod,
} from '@/lib/payments/form-schema';
import {
  insertManualPayment,
  linkPaymentRow,
  unlinkPaymentRow,
  type MatchRefusal,
} from '@/lib/queries/payment-writes';

/* ==========================================================================
   Payment writes.
   ==========================================================================

   The four rules from `invoices/actions.ts` apply unchanged and are not
   restated: assertCanWrite first, no broad catch without `unstable_rethrow`,
   `redirect()` outside the try, every mutation a POST because the session
   cookie is sameSite=lax.

   ## Revalidation

   A payment write moves figures on more surfaces than an invoice write does,
   because a payment is the thing invoice status is DERIVED from:

     /payments           the list, and its unmatched count
     /payments/[id]      the payment
     /invoices           every row's paid and outstanding column
     /invoices/[id]      the invoice's balance sequence and status
     /clients            per-client invoiced/paid/outstanding aggregates
     /clients/[id]       the same, for one client
     /dashboard          outstanding, overdue, revenue, and the unmatched queue
     /demo               the same components over the same queries

   The unmatched queue on the dashboard is the one that is easy to forget and
   the most visible if missed: a payment matched here that still sits in the
   dashboard's "awaiting a match" table invites someone to match it twice.
   ========================================================================== */

function revalidateAfterPaymentWrite(invoiceId?: string | null) {
  revalidatePath('/payments');
  revalidatePath('/invoices');
  if (invoiceId) revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/demo');
}

function toFormState(error: unknown): FormState {
  unstable_rethrow(error);
  if (error instanceof AuthorizationError) {
    return { status: 'error', message: error.message };
  }
  throw error;
}

/**
 * Each refusal says what happened and what to do instead. "Could not match" is
 * a message that leaves the user with no next move.
 */
const MATCH_MESSAGES: Record<MatchRefusal, string> = {
  'payment-not-found': 'That payment no longer exists.',
  'invoice-not-found': 'That invoice no longer exists.',
  'currency-mismatch':
    'The payment and the invoice are in different currencies, so this match is refused. ' +
    'Matching them would mean inventing an exchange rate nobody chose. Record it against ' +
    'an invoice in the same currency, or raise one.',
  'invoice-void': 'That invoice has been voided, so nothing can be owed against it.',
  'invoice-draft':
    'That invoice is still a draft — it has never been sent, so this money cannot be for it.',
  'already-matched':
    'This payment is already matched to an invoice. Unmatch it first, then match it again.',
};

export async function matchPayment(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const paymentId = String(formData.get('paymentId') ?? '');
  const invoiceId = String(formData.get('invoiceId') ?? '');

  try {
    await assertCanWrite();

    if (!invoiceId) {
      return { status: 'error', message: 'Choose an invoice to match this payment to.' };
    }

    const result = await linkPaymentRow(paymentId, invoiceId);
    if (!result.ok) {
      const base = MATCH_MESSAGES[result.reason];
      return {
        status: 'error',
        message: result.detail ? `${base} (${result.detail})` : base,
      };
    }

    revalidateAfterPaymentWrite(invoiceId);
    revalidatePath(`/payments/${paymentId}`);

    return {
      status: 'success',
      message: result.overpaid
        ? `Matched to ${result.invoiceNumber}. That invoice is now overpaid.`
        : `Matched to ${result.invoiceNumber}.`,
    };
  } catch (error) {
    return toFormState(error);
  }
}

export async function unmatchPayment(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const paymentId = String(formData.get('paymentId') ?? '');

  try {
    await assertCanWrite();

    const result = await unlinkPaymentRow(paymentId);
    if (!result.ok) {
      return {
        status: 'error',
        message:
          result.reason === 'not-matched'
            ? 'This payment is not matched to anything.'
            : 'That payment no longer exists.',
      };
    }

    revalidateAfterPaymentWrite(result.invoiceId);
    revalidatePath(`/payments/${paymentId}`);

    return {
      status: 'success',
      message: `Detached from ${result.invoiceNumber}, which is back to ${result.invoiceStatus}.`,
    };
  } catch (error) {
    return toFormState(error);
  }
}

/**
 * Records money that never came through a gateway.
 *
 * Redirects to the new payment on success rather than returning a message: the
 * thing the user wants next is to see the record they just made, and the detail
 * page is where the reference they will need to quote is displayed.
 */
export async function recordManualPayment(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let createdId: string | null = null;

  try {
    await assertCanWrite();

    const parsed = manualPaymentSchema.safeParse({
      clientId: String(formData.get('clientId') ?? ''),
      invoiceId: String(formData.get('invoiceId') ?? ''),
      amount: String(formData.get('amount') ?? ''),
      currency: String(formData.get('currency') ?? ''),
      occurredOn: String(formData.get('occurredOn') ?? ''),
      method: String(formData.get('method') ?? ''),
      status: String(formData.get('status') ?? ''),
      note: String(formData.get('note') ?? ''),
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
      }
      return {
        status: 'error',
        message: 'Check the fields marked below.',
        fieldErrors,
      };
    }

    // Money is parsed here rather than in the schema: the rule is
    // currency-dependent (2 minor digits, and a rejection rather than a round
    // for anything more precise) and zod does not know the currency until the
    // rest of the object has parsed.
    const amount = parseDecimalToMinor(parsed.data.amount, parsed.data.currency);
    if (!amount.ok) {
      return {
        status: 'error',
        message: 'Check the fields marked below.',
        fieldErrors: { amount: [amountMessage(amount.reason, parsed.data.currency)] },
      };
    }
    if (amount.minor === 0n) {
      return {
        status: 'error',
        message: 'Check the fields marked below.',
        fieldErrors: { amount: ['A payment of zero is not a payment.'] },
      };
    }

    const occurredAt = dateFromForm(parsed.data.occurredOn);
    if (!occurredAt) {
      return {
        status: 'error',
        message: 'Check the fields marked below.',
        fieldErrors: { occurredOn: ['Enter the date this money moved.'] },
      };
    }
    // A payment dated in the future is a forecast, not a record.
    if (occurredAt.getTime() > Date.now() + 24 * 3_600_000) {
      return {
        status: 'error',
        message: 'Check the fields marked below.',
        fieldErrors: { occurredOn: ['That date is in the future. Record money after it moves.'] },
      };
    }

    const result = await insertManualPayment({
      clientId: parsed.data.clientId,
      invoiceId: parsed.data.invoiceId === '' ? null : parsed.data.invoiceId,
      amountMinor: amount.minor,
      currency: parsed.data.currency,
      occurredAt,
      method: composeMethod(parsed.data.method as ManualMethod, parsed.data.note),
      status: parsed.data.status,
    });

    if (!result.ok) {
      return { status: 'error', message: manualMessage(result.reason, result.detail) };
    }

    createdId = result.id;
    revalidateAfterPaymentWrite(parsed.data.invoiceId || null);
  } catch (error) {
    return toFormState(error);
  }

  redirect(`/payments/${createdId}`);
}

function amountMessage(reason: string, currency: string): string {
  switch (reason) {
    case 'empty':
      return 'Enter the amount received.';
    case 'negative':
      return 'An amount cannot be negative. Record a refund against the original payment instead.';
    case 'too-precise':
      return `${currency} has two decimal places. Enter the exact amount rather than a longer one.`;
    case 'too-large':
      return 'That amount is larger than this ledger can hold.';
    default:
      return 'Enter an amount as digits, for example 250000.00';
  }
}

function manualMessage(reason: string, detail?: string): string {
  switch (reason) {
    case 'client-not-found':
      return 'That client no longer exists.';
    case 'invoice-not-found':
      return 'That invoice no longer exists.';
    case 'currency-mismatch':
      return `The invoice is not in that currency${detail ? ` (${detail})` : ''}, so this payment cannot settle it. Record it without an invoice, or pick one in the same currency.`;
    case 'reference-collision':
      return 'Could not allocate a unique reference after several attempts. Try again.';
    default:
      return 'That payment could not be recorded.';
  }
}
