'use server';

import { revalidatePath } from 'next/cache';
import { redirect, unstable_rethrow } from 'next/navigation';

import { assertCanWrite, AuthorizationError } from '@/lib/auth/guard';
import { blankToNull, clientFormSchema } from '@/lib/clients/form-schema';
import type { FormState } from '@/lib/invoices/form-state';
import {
  archiveClientRow,
  insertClient,
  unarchiveClientRow,
  updateClientRow,
  type ClientWriteInput,
} from '@/lib/queries/client-writes';

/* ==========================================================================
   Client writes.
   ==========================================================================

   The same four rules the invoice actions follow, for the same reasons:

   1. `assertCanWrite()` first in every action — before validation, before any
      read. It throws rather than redirecting, because a refused write that
      navigates looks exactly like a successful one.
   2. Nothing catches broadly. `unstable_rethrow` re-throws Next's redirect and
      not-found signals, so a catch cannot swallow them and leave a form that
      appears to do nothing on success.
   3. `redirect()` sits outside the try, after the write returned.
   4. Every one of these is a Server Action reached by POST. The session cookie
      is sameSite=lax, so a cross-site GET would carry it.

   ## Revalidation

   Archiving a client changes more than the client:

     /clients          the list, and its default hide-archived filter
     /clients/[id]     the client
     /invoices         rows carry the client's name
     /invoices/new     the picker this client has to drop out of
     /dashboard /demo  the overdue and unmatched tables name clients

   The picker is the one that is easy to miss and the entire point of the
   feature: an archived client who still appears in the invoice form has not
   been archived in any sense the user cares about.
   ========================================================================== */

function revalidateClient(id?: string) {
  revalidatePath('/clients');
  if (id) revalidatePath(`/clients/${id}`);
  revalidatePath('/invoices');
  revalidatePath('/invoices/new');
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

type Validated = { ok: true; write: ClientWriteInput } | { ok: false; state: FormState };

function validate(formData: FormData): Validated {
  const parsed = clientFormSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? '').trim(),
    phone: String(formData.get('phone') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
    }
    return {
      ok: false,
      state: { status: 'error', message: 'Check the fields marked below.', fieldErrors },
    };
  }

  return {
    ok: true,
    write: {
      name: parsed.data.name,
      email: blankToNull(parsed.data.email),
      phone: blankToNull(parsed.data.phone),
      notes: blankToNull(parsed.data.notes),
    },
  };
}

export async function createClient(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let created;
  try {
    await assertCanWrite();
    const parsed = validate(formData);
    if (!parsed.ok) return parsed.state;

    created = await insertClient(parsed.write);
    revalidateClient(created.id);
  } catch (error) {
    return toFormState(error);
  }

  redirect(`/clients/${created.id}`);
}

export async function updateClient(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get('clientId') ?? '');

  try {
    await assertCanWrite();
    const parsed = validate(formData);
    if (!parsed.ok) return parsed.state;

    const updated = await updateClientRow(id, parsed.write);
    if (!updated) return { status: 'error', message: 'That client no longer exists.' };
    revalidateClient(id);
  } catch (error) {
    return toFormState(error);
  }

  redirect(`/clients/${id}`);
}

const ARCHIVE_MESSAGES = {
  'not-found': 'That client no longer exists.',
  'already-archived': 'This client is already archived.',
  'not-archived': 'This client is not archived.',
} as const;

export async function archiveClient(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanWrite();
    const id = String(formData.get('clientId') ?? '');
    if (!id) return { status: 'error', message: 'No client was named.' };

    const result = await archiveClientRow(id);
    if (!result.ok) return { status: 'error', message: ARCHIVE_MESSAGES[result.reason] };

    revalidateClient(id);
    return { status: 'success', message: 'Client archived.' };
  } catch (error) {
    return toFormState(error);
  }
}

export async function unarchiveClient(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanWrite();
    const id = String(formData.get('clientId') ?? '');
    if (!id) return { status: 'error', message: 'No client was named.' };

    const result = await unarchiveClientRow(id);
    if (!result.ok) return { status: 'error', message: ARCHIVE_MESSAGES[result.reason] };

    revalidateClient(id);
    return { status: 'success', message: 'Client restored.' };
  } catch (error) {
    return toFormState(error);
  }
}
