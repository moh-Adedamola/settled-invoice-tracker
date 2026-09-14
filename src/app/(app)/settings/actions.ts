'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { assertCanWrite, AuthorizationError } from '@/lib/auth/guard';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { invalidateOtherUserSessions } from '@/lib/auth/session';
import { db, users } from '@/lib/db';
import type { FormState } from '@/lib/invoices/form-state';
import {
  businessDetailsSchema,
  notificationSettingsSchema,
  passwordChangeSchema,
  reminderSettingsSchema,
} from '@/lib/settings/form-schema';
import {
  saveBusinessDetails,
  saveNotificationSettings,
  saveReminderSettings,
} from '@/lib/queries/settings';

/* ==========================================================================
   Settings writes.
   ==========================================================================

   The four rules from `invoices/actions.ts` apply unchanged: assertCanWrite
   first, no broad catch without `unstable_rethrow`, redirect outside any try,
   every mutation a POST because the session cookie is sameSite=lax.

   ## Revalidation

   Most settings here do not appear on another screen yet — outbound is not
   built, so the business details and the Telegram target are stored and shown
   only on this page. `/settings` alone is the honest revalidation for those.

   The business NAME is the exception: it is the thing that will appear on every
   invoice PDF and receipt, and it is already the product's own name in the
   shell. When those surfaces exist they read from `getSettings`, so the paths
   are listed now, next to the write that moves them, rather than discovered as
   a stale-figure bug later.
   ========================================================================== */

function toFormState(error: unknown): FormState {
  unstable_rethrow(error);
  if (error instanceof AuthorizationError) {
    return { status: 'error', message: error.message };
  }
  throw error;
}

function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    (fieldErrors[issue.path.join('.')] ??= []).push(issue.message);
  }
  return fieldErrors;
}

const invalid = (issues: { path: PropertyKey[]; message: string }[]): FormState => ({
  status: 'error',
  message: 'Check the fields marked below.',
  fieldErrors: fieldErrorsOf(issues),
});

/* -------------------------------------------------------------------------- */

export async function updateBusinessDetails(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanWrite();

    const parsed = businessDetailsSchema.safeParse({
      businessName: String(formData.get('businessName') ?? ''),
      businessAddress: String(formData.get('businessAddress') ?? ''),
      businessEmail: String(formData.get('businessEmail') ?? '').trim(),
      businessPhone: String(formData.get('businessPhone') ?? ''),
    });
    if (!parsed.success) return invalid(parsed.error.issues);

    await saveBusinessDetails(parsed.data);

    revalidatePath('/settings');
    // Where the business name will be printed once outbound exists.
    revalidatePath('/invoices');
    revalidatePath('/dashboard');

    return { status: 'success', message: 'Business details saved.' };
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateReminderSettings(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanWrite();

    const parsed = reminderSettingsSchema.safeParse({
      // An unchecked checkbox submits nothing at all, so absence is false.
      remindersEnabled: formData.get('remindersEnabled') === 'on',
      reminderDay1: String(formData.get('reminderDay1') ?? ''),
      reminderDay2: String(formData.get('reminderDay2') ?? ''),
      reminderDay3: String(formData.get('reminderDay3') ?? ''),
    });
    if (!parsed.success) return invalid(parsed.error.issues);

    const saved = await saveReminderSettings(parsed.data);
    if (!saved.ok) return { status: 'error', message: saved.detail };

    revalidatePath('/settings');
    // The dashboard counts overdue invoices and shows where each sits in the
    // ladder, so moving the ladder moves what that panel says.
    revalidatePath('/dashboard');
    revalidatePath('/invoices');

    return {
      status: 'success',
      message: parsed.data.remindersEnabled
        ? `Reminders will go out ${parsed.data.reminderDay1}, ${parsed.data.reminderDay2} and ${parsed.data.reminderDay3} days past due.`
        : 'Reminders saved, and automated chasing is switched off.',
    };
  } catch (error) {
    return toFormState(error);
  }
}

export async function updateNotificationSettings(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await assertCanWrite();

    const parsed = notificationSettingsSchema.safeParse({
      telegramChatId: String(formData.get('telegramChatId') ?? '').trim(),
      alertOnPaymentSuccess: formData.get('alertOnPaymentSuccess') === 'on',
      alertOnPaymentFailure: formData.get('alertOnPaymentFailure') === 'on',
    });
    if (!parsed.success) return invalid(parsed.error.issues);

    await saveNotificationSettings(parsed.data);
    revalidatePath('/settings');

    return { status: 'success', message: 'Notification settings saved.' };
  } catch (error) {
    return toFormState(error);
  }
}

/* -------------------------------------------------------------------------- */
/* Password                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Change the signed-in user's password.
 *
 * Three things have to be true and are checked in this order:
 *
 *  1. The caller may write at all. `assertCanWrite` first, as everywhere.
 *  2. The CURRENT password verifies. Without this, anyone who finds an
 *     unattended signed-in browser can lock the owner out of their own account
 *     — the session cookie alone must not be enough to change the credential
 *     that outlives it.
 *  3. The new password parses. Checked before the current one is verified so a
 *     typo in the confirmation does not spend an argon2 verification, but
 *     reported the same way either order.
 *
 * On success every OTHER session ends. That is the point of changing a password
 * after a device is lost: the sessions already issued are exactly what needs
 * revoking. This session survives, because logging someone out at the moment
 * they secure their account reads as failure.
 */
export async function changePassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const session = await assertCanWrite();

    const parsed = passwordChangeSchema.safeParse({
      currentPassword: String(formData.get('currentPassword') ?? ''),
      newPassword: String(formData.get('newPassword') ?? ''),
      confirmPassword: String(formData.get('confirmPassword') ?? ''),
    });
    if (!parsed.success) return invalid(parsed.error.issues);

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!row) return { status: 'error', message: 'That account no longer exists.' };

    const ok = await verifyPassword(row.passwordHash, parsed.data.currentPassword);
    if (!ok) {
      // Named against the field it belongs to. A generic "incorrect" on a form
      // with three password boxes makes the user guess which one is wrong.
      return {
        status: 'error',
        message: 'Check the fields marked below.',
        fieldErrors: { currentPassword: ['That is not your current password.'] },
      };
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, session.user.id));

    const endedElsewhere = await invalidateOtherUserSessions(
      session.user.id,
      session.session.id,
    );

    revalidatePath('/settings');

    return {
      status: 'success',
      message:
        endedElsewhere === 0
          ? 'Password changed. You were not signed in anywhere else.'
          : `Password changed, and ${endedElsewhere} other ${
              endedElsewhere === 1 ? 'session was' : 'sessions were'
            } signed out. This one is still active.`,
    };
  } catch (error) {
    return toFormState(error);
  }
}
