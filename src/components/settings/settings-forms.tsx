'use client';

import { useActionState, useId, useState } from 'react';

import {
  changePassword,
  updateBusinessDetails,
  updateNotificationSettings,
  updateReminderSettings,
} from '@/app/(app)/settings/actions';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/invoices/form-state';
import { MIN_PASSWORD_LENGTH } from '@/lib/settings/form-schema';
import { PresenceMark } from '@/components/ui/presence-mark';

/* ==========================================================================
   The settings forms.
   ==========================================================================

   Every field is driven from state, never `defaultValue`. React 19 resets an
   uncontrolled field once a form action completes, so a failed submit would
   blank every field the error did not name — measured on the invoice form,
   where a bad unit price wiped the client, both dates and the description.

   Each panel is its own form posting its own action, rather than one page-wide
   save. Three reasons, in order of weight: a validation failure in the reminder
   ladder must not block a business-address change the user also made; each
   action writes only the columns its panel owns, so two tabs cannot revert each
   other; and a save button beside the fields it saves is the only arrangement
   where "saved" is unambiguous about what.
   ========================================================================== */

const field =
  'h-9 w-full rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink placeholder:text-ink-muted';

function Panel({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  id: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-h3 text-ink">
          {title}
        </h2>
        <p className="max-w-[70ch] text-small text-ink-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  errors,
  hint,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  errors?: string[];
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-micro uppercase text-ink-muted">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </label>
      {children}
      {errors ? (
        <p role="alert" className="text-micro text-failed">
          {errors.join(' ')}
        </p>
      ) : hint ? (
        <p className="text-micro text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * The result line under a panel's save button.
 *
 * Success is a sentence, not a toast: these panels are read one after another
 * while someone works down the page, and a message that disappears on a timer
 * is a message the person scrolling past it never saw. It stays until the next
 * submit replaces it.
 */
function Result({ state }: { state: FormState }) {
  if (state.status === 'idle' || !state.message) return null;

  const failed = state.status === 'error';
  return (
    <p
      role={failed ? 'alert' : 'status'}
      className={`rounded-sm border border-l-[3px] px-3 py-2.5 text-small ${
        failed
          ? 'border-failed-line border-l-failed bg-failed-bg text-failed'
          : 'border-paid-line border-l-paid bg-paid-bg text-paid'
      }`}
    >
      {state.message}
    </p>
  );
}

function SaveButton({ pending, label = 'Save' }: { pending: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="ring-inverse inline-flex h-9 w-fit items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

export function BusinessDetailsForm({
  initial,
}: {
  initial: {
    businessName: string;
    businessAddress: string;
    businessEmail: string;
    businessPhone: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateBusinessDetails, EMPTY_FORM_STATE);
  const [values, setValues] = useState(initial);
  const formId = useId();
  const set = (key: keyof typeof initial, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));
  const errorsFor = (path: string) => state.fieldErrors?.[path];

  return (
    <Panel
      id="business-heading"
      title="Business details"
      description="What appears at the top of an invoice and in the footer of a receipt. Nothing here is sent anywhere yet — outbound is not built — but an invoice cannot be issued from a business with no name, so this is where that name lives."
    >
      <form action={formAction} className="flex max-w-[60ch] flex-col gap-4">
        <Result state={state} />

        <Field label="Name" htmlFor={`${formId}-name`} errors={errorsFor('businessName')} required>
          <input
            id={`${formId}-name`}
            name="businessName"
            value={values.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            autoComplete="organization"
            className={field}
          />
        </Field>

        <Field
          label="Address"
          htmlFor={`${formId}-address`}
          errors={errorsFor('businessAddress')}
          hint="Optional. Printed as typed, so line breaks are kept."
        >
          <textarea
            id={`${formId}-address`}
            name="businessAddress"
            rows={3}
            value={values.businessAddress}
            onChange={(e) => set('businessAddress', e.target.value)}
            className="w-full rounded-sm border border-line-strong bg-transparent px-2.5 py-2 text-small text-ink placeholder:text-ink-muted"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Contact email"
            htmlFor={`${formId}-email`}
            errors={errorsFor('businessEmail')}
            hint="Where clients reply. Optional."
          >
            <input
              id={`${formId}-email`}
              name="businessEmail"
              type="email"
              value={values.businessEmail}
              onChange={(e) => set('businessEmail', e.target.value)}
              autoComplete="email"
              className={`money ${field}`}
            />
          </Field>

          <Field
            label="Phone"
            htmlFor={`${formId}-phone`}
            errors={errorsFor('businessPhone')}
            hint="Optional."
          >
            <input
              id={`${formId}-phone`}
              name="businessPhone"
              type="tel"
              value={values.businessPhone}
              onChange={(e) => set('businessPhone', e.target.value)}
              autoComplete="tel"
              className={`money ${field}`}
            />
          </Field>
        </div>

        <SaveButton pending={pending} />
      </form>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

export function ReminderSettingsForm({
  initial,
}: {
  initial: {
    remindersEnabled: boolean;
    reminderDay1: number;
    reminderDay2: number;
    reminderDay3: number;
  };
}) {
  const [state, formAction, pending] = useActionState(updateReminderSettings, EMPTY_FORM_STATE);
  const [values, setValues] = useState({
    remindersEnabled: initial.remindersEnabled,
    reminderDay1: String(initial.reminderDay1),
    reminderDay2: String(initial.reminderDay2),
    reminderDay3: String(initial.reminderDay3),
  });
  const formId = useId();
  const errorsFor = (path: string) => state.fieldErrors?.[path];

  const days = [
    { key: 'reminderDay1' as const, label: 'First nudge' },
    { key: 'reminderDay2' as const, label: 'Second nudge' },
    { key: 'reminderDay3' as const, label: 'Third nudge' },
  ];

  return (
    <Panel
      id="reminders-heading"
      title="Reminder ladder"
      description="How many days past its due date an invoice is chased. Three steps, each later than the last."
    >
      <form action={formAction} className="flex max-w-[60ch] flex-col gap-4">
        <Result state={state} />

        {/*
          The master switch leads, because it changes what the rest of the panel
          means. The day fields stay editable when it is off: someone turning
          chasing off for a quiet month should not have to retype the ladder to
          turn it back on.
        */}
        <label className="flex w-fit cursor-pointer items-center gap-2 text-small text-ink">
          <input
            type="checkbox"
            name="remindersEnabled"
            checked={values.remindersEnabled}
            onChange={(e) => setValues((v) => ({ ...v, remindersEnabled: e.target.checked }))}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Chase overdue invoices automatically
        </label>

        {!values.remindersEnabled ? (
          <p className="rounded-sm border border-line bg-surface-raised px-3 py-2.5 text-small text-ink-secondary">
            Nothing will be sent while this is off. The ladder below is kept so it
            is still here when you turn chasing back on.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {days.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              htmlFor={`${formId}-${key}`}
              errors={errorsFor(key)}
              hint="days past due"
            >
              {/* inputMode numeric with type=text: a number input offers
                  spinners and accepts exponent notation, neither of which
                  belongs on a count of days. */}
              <input
                id={`${formId}-${key}`}
                name={key}
                type="text"
                inputMode="numeric"
                value={values[key]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [key]: e.target.value.replace(/[^\d]/g, '') }))
                }
                className={`money ${field} text-right`}
              />
            </Field>
          ))}
        </div>

        <SaveButton pending={pending} />
      </form>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

export function NotificationSettingsForm({
  initial,
  botTokenPresent,
}: {
  initial: {
    telegramChatId: string;
    alertOnPaymentSuccess: boolean;
    alertOnPaymentFailure: boolean;
  };
  /** Whether TELEGRAM_BOT_TOKEN is set. Never the token — §7, presence marks. */
  botTokenPresent: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    updateNotificationSettings,
    EMPTY_FORM_STATE,
  );
  const [values, setValues] = useState(initial);
  const formId = useId();
  const errorsFor = (path: string) => state.fieldErrors?.[path];

  return (
    <Panel
      id="notifications-heading"
      title="Alerts"
      description="Where Settled tells you a payment landed or failed."
    >
      <form action={formAction} className="flex max-w-[60ch] flex-col gap-4">
        <Result state={state} />

        <Field
          label="Telegram chat id"
          htmlFor={`${formId}-chat`}
          errors={errorsFor('telegramChatId')}
          hint="A number — negative for a group or channel. Leave empty to send nowhere."
        >
          <input
            id={`${formId}-chat`}
            name="telegramChatId"
            type="text"
            inputMode="numeric"
            value={values.telegramChatId}
            onChange={(e) => setValues((v) => ({ ...v, telegramChatId: e.target.value }))}
            placeholder="-1001234567890"
            className={`money ${field}`}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-micro uppercase text-ink-muted">Send an alert when</legend>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-small text-ink">
            <input
              type="checkbox"
              name="alertOnPaymentSuccess"
              checked={values.alertOnPaymentSuccess}
              onChange={(e) =>
                setValues((v) => ({ ...v, alertOnPaymentSuccess: e.target.checked }))
              }
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            a payment succeeds
          </label>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-small text-ink">
            <input
              type="checkbox"
              name="alertOnPaymentFailure"
              checked={values.alertOnPaymentFailure}
              onChange={(e) =>
                setValues((v) => ({ ...v, alertOnPaymentFailure: e.target.checked }))
              }
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            a payment fails
          </label>
        </fieldset>

        {/*
          Said on the page, not only in a comment. Someone looking for where to
          paste a bot token needs to find out here that this is not the place —
          and, just as importantly, whether it has been set at all.

          Without the mark this panel could be filled in completely and still
          send nothing: the dispatcher skips silently when the token is missing,
          which is right for a cron and useless for a person. Present/absent
          only, on the same terms as the gateway panel — the value is never
          rendered, not even masked.
        */}
        <div className="flex flex-col gap-2 rounded-sm border border-line bg-surface-raised px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="money text-micro text-ink-muted">TELEGRAM_BOT_TOKEN</span>
            <PresenceMark
              ok={botTokenPresent}
              yes="Token present"
              no="Token absent"
              explainNo="No alert can be sent until this is set in the environment."
            />
          </div>
          <p className="text-small text-ink-secondary">
            The bot token lives in the environment, not in this database — a
            credential in a table is a credential in every backup and every replica.
            Only the destination is configured here.
          </p>
        </div>

        <SaveButton pending={pending} />
      </form>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Changing the password.
 *
 * Behind a confirm-in-place trigger rather than sitting open: three empty
 * password boxes on a settings page invite a browser's autofill to put
 * something in them, and a form nobody opened should not be able to submit.
 *
 * The panel closes on success, and the fields are cleared with it — leaving a
 * typed password sitting in the DOM after it has been changed is the one piece
 * of state on this page worth actively discarding.
 */
export function PasswordChangeForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(changePassword, EMPTY_FORM_STATE);

  const succeeded = state.status === 'success';
  // Derived, not an effect: `set-state-in-effect` is a cascading render to
  // compute what `state.status` already says.
  const showForm = open && !succeeded;

  return (
    <Panel
      id="password-heading"
      title="Password"
      description="Changing it signs out every other session and leaves this one alone."
    >
      {succeeded ? <Result state={state} /> : null}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-9 w-fit items-center rounded-sm border border-line-strong px-3 text-small text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover"
        >
          {succeeded ? 'Change it again' : 'Change password'}
        </button>
      ) : (
        <PasswordFields
          formAction={formAction}
          state={state}
          pending={pending}
          onCancel={() => setOpen(false)}
        />
      )}
    </Panel>
  );
}

/**
 * Keyed on nothing, but remounted by `PasswordChangeForm` closing and
 * reopening — which is what clears the three boxes after a successful change.
 */
function PasswordFields({
  formAction,
  state,
  pending,
  onCancel,
}: {
  formAction: (formData: FormData) => void;
  state: FormState;
  pending: boolean;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const formId = useId();
  const errorsFor = (path: string) => state.fieldErrors?.[path];
  const set = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  return (
    <form action={formAction} className="flex max-w-[48ch] flex-col gap-4">
      {state.status === 'error' ? <Result state={state} /> : null}

      <Field
        label="Current password"
        htmlFor={`${formId}-current`}
        errors={errorsFor('currentPassword')}
        required
      >
        <input
          id={`${formId}-current`}
          name="currentPassword"
          type="password"
          value={values.currentPassword}
          onChange={(e) => set('currentPassword', e.target.value)}
          autoComplete="current-password"
          className={field}
        />
      </Field>

      <Field
        label="New password"
        htmlFor={`${formId}-new`}
        errors={errorsFor('newPassword')}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. Length beats punctuation — a passphrase is fine.`}
        required
      >
        <input
          id={`${formId}-new`}
          name="newPassword"
          type="password"
          value={values.newPassword}
          onChange={(e) => set('newPassword', e.target.value)}
          autoComplete="new-password"
          className={field}
        />
      </Field>

      <Field
        label="New password again"
        htmlFor={`${formId}-confirm`}
        errors={errorsFor('confirmPassword')}
        required
      >
        <input
          id={`${formId}-confirm`}
          name="confirmPassword"
          type="password"
          value={values.confirmPassword}
          onChange={(e) => set('confirmPassword', e.target.value)}
          autoComplete="new-password"
          className={field}
        />
      </Field>

      <div className="flex items-center gap-3">
        <SaveButton pending={pending} label="Change password" />
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-xs text-small text-ink-secondary underline underline-offset-2 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
