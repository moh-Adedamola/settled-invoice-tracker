import { z } from 'zod';

/**
 * The settings forms' shapes.
 *
 * Not server-only: the forms import them for field names and the actions import
 * them to validate, so the two cannot drift.
 */

/* -------------------------------------------------------------------------- */
/* Business details                                                           */
/* -------------------------------------------------------------------------- */

/**
 * These end up on an invoice PDF and in receipt emails, so the validation is
 * about what a recipient needs, not about what a database will accept.
 *
 * The name is required because an invoice from nobody is not an invoice. The
 * rest are optional: an agency working out of a co-working space may genuinely
 * have no address it wants printed, and refusing to save the name until one is
 * invented is how placeholder data gets onto outbound documents.
 */
export const businessDetailsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(1, 'An invoice has to say who it is from.')
    .max(120, 'Keep it under 120 characters.'),
  businessAddress: z.string().trim().max(400, 'Keep it under 400 characters.'),
  businessEmail: z.union([
    z.email('That does not look like an email address.'),
    z.literal(''),
  ]),
  businessPhone: z.string().trim().max(40, 'Keep it under 40 characters.'),
});

export type BusinessDetailsValues = z.infer<typeof businessDetailsSchema>;

/* -------------------------------------------------------------------------- */
/* Reminder ladder                                                            */
/* -------------------------------------------------------------------------- */

const day = (label: string) =>
  z.coerce
    .number({ error: `${label} must be a number of days.` })
    .int(`${label} must be a whole number of days.`)
    .min(1, `${label} must be at least 1 day past due.`)
    .max(365, `${label} must be within a year of the due date.`);

/**
 * Ascending and distinct, checked here AND by a CHECK constraint.
 *
 * Two copies of one rule, on purpose. The constraint is the one that cannot be
 * bypassed — it governs a future cron job, a psql session and this form
 * equally. This copy exists so the user gets "the second nudge must come after
 * the first" against the field that is wrong, instead of a constraint violation
 * against the whole form.
 *
 * Strict `<` gives ascending and distinct together; two separate rules would
 * let 3/7/7 produce a confusing "distinct" error about a value that is also not
 * ascending.
 */
export const reminderSettingsSchema = z
  .object({
    remindersEnabled: z.boolean(),
    reminderDay1: day('The first nudge'),
    reminderDay2: day('The second nudge'),
    reminderDay3: day('The third nudge'),
  })
  .refine((v) => v.reminderDay1 < v.reminderDay2, {
    path: ['reminderDay2'],
    error: 'The second nudge must come after the first.',
  })
  .refine((v) => v.reminderDay2 < v.reminderDay3, {
    path: ['reminderDay3'],
    error: 'The third nudge must come after the second.',
  });

export type ReminderSettingsValues = z.infer<typeof reminderSettingsSchema>;

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A Telegram chat id: an integer, negative for groups and channels.
 *
 * Validated rather than accepted as free text because a wrong chat id fails
 * silently — the bot posts nowhere and nobody finds out until the alert they
 * were relying on does not arrive.
 *
 * The BOT TOKEN is not here and never will be. A token is a credential; a chat
 * id is an address and grants nothing on its own.
 */
export const notificationSettingsSchema = z
  .object({
    telegramChatId: z.union([
      z
        .string()
        .trim()
        .regex(/^-?\d{1,20}$/, 'A chat id is a number, like 123456789 or -1001234567890.'),
      z.literal(''),
    ]),
    alertOnPaymentSuccess: z.boolean(),
    alertOnPaymentFailure: z.boolean(),
  })
  .refine(
    (v) => v.telegramChatId !== '' || (!v.alertOnPaymentSuccess && !v.alertOnPaymentFailure),
    {
      path: ['telegramChatId'],
      error:
        'Alerts are switched on but there is nowhere to send them. Add a chat id, or turn the alerts off.',
    },
  );

export type NotificationSettingsValues = z.infer<typeof notificationSettingsSchema>;

/* -------------------------------------------------------------------------- */
/* Password                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Length, and nothing else.
 *
 * Composition rules — an uppercase, a digit, a symbol — measurably push people
 * toward `Password1!` and toward reusing the one string that satisfies every
 * site's rules. Length is the property that actually resists guessing. 12 is
 * the floor; the argon2 hasher caps the input at its own limit well above any
 * sane passphrase.
 *
 * The confirmation is compared here rather than in the browser alone, because
 * "the browser checked it" is not a thing the server may assume.
 */
export const MIN_PASSWORD_LENGTH = 12;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(256, 'That is longer than this form accepts.'),
    confirmPassword: z.string().min(1, 'Type the new password again.'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    error: 'The two new passwords do not match.',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    error: 'That is the password you are already using.',
  });

export type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;
