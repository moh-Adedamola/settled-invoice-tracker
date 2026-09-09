'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';
import { z } from 'zod';

import { assertCanWrite, AuthorizationError } from '@/lib/auth/guard';
import type { FormState } from '@/lib/invoices/form-state';
import {
  computeLines,
  dateFromForm,
  invoiceFormSchema,
  MAX_LINE_ITEMS,
  type InvoiceFormValues,
} from '@/lib/invoices/form-schema';
import {
  insertInvoice,
  markInvoiceSentRow,
  updateDraftInvoice,
  voidInvoiceRow,
  type InvoiceWriteInput,
} from '@/lib/queries/invoice-writes';

/* ==========================================================================
   The first write path.
   ==========================================================================

   Four rules govern everything below, and each one is a failure this codebase
   has already been bitten by or deliberately designed against.

   1. `assertCanWrite()` is the FIRST statement in every action — before
      validation, before any read. It throws rather than redirecting, because a
      refused write that navigates looks exactly like a successful one.

   2. Nothing catches broadly. `redirect()` and `notFound()` work by throwing a
      NEXT_REDIRECT / NEXT_NOT_FOUND signal that Next unwinds into a navigation,
      so a `catch (e)` around a redirect swallows it and the form sits there
      doing nothing on success. Every catch here calls `unstable_rethrow(e)`
      first, which re-throws Next's control-flow errors and lets real ones fall
      through.

   3. `redirect()` is called OUTSIDE any try block, after the write has
      returned. Even with the rethrow above, keeping the throw out of the try is
      what makes that obvious to the next reader.

   4. Every one of these is a Server Action, reached by POST. The session cookie
      is sameSite=lax, so a GET carries it cross-site: a link to
      /invoices/[id]/void would be a CSRF hole with a nice hover state.

   ## Revalidation

   A write moves figures on three surfaces, and all three read aggregates:

     /invoices          the list, its totals and its status filter counts
     /invoices/[id]     the invoice itself
     /dashboard         KPIs — outstanding, overdue, revenue — computed over
                        every invoice, so a new draft moves them
     /demo              the same dashboard components over the same queries

   Missing any of them shows a stale figure next to a fresh one, which on a
   ledger reads as a bug in the arithmetic rather than a caching artefact.
   ========================================================================== */

/** Everything a write touches. */
function revalidateInvoice(id?: string) {
  revalidatePath('/invoices');
  if (id) revalidatePath(`/invoices/${id}`);
  revalidatePath('/dashboard');
  revalidatePath('/demo');
}

/**
 * Turns an AuthorizationError into a form state and lets everything else
 * through — including Next's redirect and notFound signals.
 */
function toFormState(error: unknown): FormState {
  unstable_rethrow(error);
  if (error instanceof AuthorizationError) {
    return { status: 'error', message: error.message };
  }
  throw error;
}

/* --------------------------------------------------------------------------
   Reading the form
   -------------------------------------------------------------------------- */

/**
 * Line items arrive as parallel indexed fields — `lineItems.0.description` and
 * so on — because that is what a plain HTML form can express. They are read by
 * index rather than by collecting `getAll()`, so a removed row cannot silently
 * shift a quantity onto the wrong description.
 */
function readForm(formData: FormData): unknown {
  const lineItems: unknown[] = [];
  for (let i = 0; i < MAX_LINE_ITEMS; i += 1) {
    const description = formData.get(`lineItems.${i}.description`);
    const quantity = formData.get(`lineItems.${i}.quantity`);
    const unitAmount = formData.get(`lineItems.${i}.unitAmount`);
    if (description === null && quantity === null && unitAmount === null) continue;
    lineItems.push({
      description: String(description ?? ''),
      quantity: String(quantity ?? ''),
      unitAmount: String(unitAmount ?? ''),
    });
  }

  return {
    clientId: String(formData.get('clientId') ?? ''),
    currency: String(formData.get('currency') ?? ''),
    issuedAt: String(formData.get('issuedAt') ?? ''),
    dueAt: String(formData.get('dueAt') ?? ''),
    description: String(formData.get('description') ?? ''),
    lineItems,
  };
}

type Validated =
  | { ok: true; values: InvoiceFormValues; write: InvoiceWriteInput }
  | { ok: false; state: FormState };

function validate(formData: FormData): Validated {
  const parsed = invoiceFormSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    const flat = z.flattenError(parsed.error);
    const fieldErrors: Record<string, string[]> = {};
    // flattenError only reaches the top level, and line-item errors are nested,
    // so the issue list is walked directly to keep `lineItems.2.quantity`.
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      (fieldErrors[path] ??= []).push(issue.message);
    }
    return {
      ok: false,
      state: {
        status: 'error',
        message: flat.formErrors[0] ?? 'Check the fields marked below.',
        fieldErrors,
      },
    };
  }

  const money = computeLines(parsed.data);
  if (!money.ok) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of money.issues) (fieldErrors[issue.path] ??= []).push(issue.message);
    return {
      ok: false,
      state: { status: 'error', message: 'Check the amounts marked below.', fieldErrors },
    };
  }

  const values = parsed.data;
  const issuedAt = dateFromForm(values.issuedAt);
  const dueAt = dateFromForm(values.dueAt);

  if (issuedAt && dueAt && dueAt.getTime() < issuedAt.getTime()) {
    return {
      ok: false,
      state: {
        status: 'error',
        message: 'The due date is before the issue date.',
        fieldErrors: { dueAt: ['Cannot be before the issue date.'] },
      },
    };
  }

  return {
    ok: true,
    values,
    write: {
      clientId: values.clientId,
      currency: values.currency,
      description: values.description === '' ? null : values.description,
      issuedAt,
      dueAt,
      lineItems: money.lines.map((line, index) => ({
        position: index + 1,
        description: values.lineItems[index]!.description,
        quantity: line.quantity,
        unitAmountMinor: line.unitAmountMinor,
        lineAmountMinor: line.lineAmountMinor,
      })),
    },
  };
}

/* --------------------------------------------------------------------------
   Actions
   -------------------------------------------------------------------------- */

export async function createInvoice(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let created;
  try {
    await assertCanWrite();

    const parsed = validate(formData);
    if (!parsed.ok) return parsed.state;

    created = await insertInvoice(parsed.write, new Date().getUTCFullYear());
    revalidateInvoice(created.id);
  } catch (error) {
    return toFormState(error);
  }

  // Outside the try, deliberately — see rule 3 above.
  redirect(`/invoices/${created.id}`);
}

export async function updateInvoice(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get('invoiceId') ?? '');

  try {
    await assertCanWrite();

    const parsed = validate(formData);
    if (!parsed.ok) return parsed.state;

    const updated = await updateDraftInvoice(id, parsed.write);
    if (!updated) {
      // The guard is in the WHERE clause, so zero rows means it refused.
      return {
        status: 'error',
        message:
          'This invoice is no longer a draft, so it cannot be edited. ' +
          'A sent invoice is a document the client already has — raise a credit ' +
          'note or void it and issue a replacement.',
      };
    }
    revalidateInvoice(id);
  } catch (error) {
    return toFormState(error);
  }

  redirect(`/invoices/${id}`);
}

export async function voidInvoice(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanWrite();

    const id = String(formData.get('invoiceId') ?? '');
    if (!id) return { status: 'error', message: 'No invoice was named.' };

    const result = await voidInvoiceRow(id);
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        'not-found': 'That invoice no longer exists.',
        'has-payments':
          `This invoice has ${result.paymentCount} payment${result.paymentCount === 1 ? '' : 's'} ` +
          'recorded against it. Voiding it would leave that money attached to a ' +
          'cancelled document, which is a reconciliation problem rather than a ' +
          'status change — refund or reassign the payments first.',
        'already-void': 'This invoice is already void.',
        'wrong-status': 'Only a draft or sent invoice can be voided.',
      };
      return { status: 'error', message: messages[result.reason] };
    }

    revalidateInvoice(id);
    return { status: 'success', message: 'Invoice voided.' };
  } catch (error) {
    return toFormState(error);
  }
}

export async function markInvoiceSent(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanWrite();

    const id = String(formData.get('invoiceId') ?? '');
    if (!id) return { status: 'error', message: 'No invoice was named.' };

    const result = await markInvoiceSentRow(id);
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        'not-found': 'That invoice no longer exists.',
        'not-draft': 'Only a draft can be marked as sent.',
        'no-line-items': 'Add at least one line item before sending this invoice.',
      };
      return { status: 'error', message: messages[result.reason] };
    }

    revalidateInvoice(id);
    return { status: 'success', message: 'Invoice marked as sent.' };
  } catch (error) {
    return toFormState(error);
  }
}
