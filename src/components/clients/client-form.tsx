'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';

import { EMPTY_FORM_STATE, type FormState } from '@/lib/invoices/form-state';

/**
 * The client form.
 *
 * Every field is driven from state, never `defaultValue`. React 19 resets an
 * uncontrolled field after a form action completes, so a failed submit would
 * blank the fields the error did not name — the exact failure the invoice form
 * was measured hitting, where a bad unit price wiped the client, both dates and
 * the description.
 *
 * `providerCustomerIds` has no field here on purpose. The event processor owns
 * it — it is how a webhook's customer maps to a client, and a hand-typed value
 * would quietly mis-route real money. The detail page shows it as a fact about
 * the record.
 */
export type ClientFormInitial = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

export function ClientForm({
  action,
  initial,
  clientId,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial: ClientFormInitial;
  clientId?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [values, setValues] = useState(initial);
  const formId = useId();

  const set = <K extends keyof ClientFormInitial>(key: K, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const errorsFor = (path: string) => state.fieldErrors?.[path];

  const field =
    'h-9 w-full rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink placeholder:text-ink-muted';

  return (
    <form action={formAction} className="flex max-w-[70ch] flex-col gap-6">
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="rounded-sm border border-failed-line border-l-[3px] border-l-failed bg-failed-bg px-3 py-2.5 text-small text-failed"
        >
          {state.message}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4">
        <Field label="Name" htmlFor={`${formId}-name`} errors={errorsFor('name')} required>
          <input
            id={`${formId}-name`}
            name="name"
            type="text"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            autoComplete="organization"
            className={field}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Email"
            htmlFor={`${formId}-email`}
            errors={errorsFor('email')}
            hint="Optional — a client you invoice by hand may not have one."
          >
            <input
              id={`${formId}-email`}
              name="email"
              type="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              autoComplete="email"
              placeholder="accounts@example.com"
              className={`money ${field}`}
            />
          </Field>

          <Field label="Phone" htmlFor={`${formId}-phone`} errors={errorsFor('phone')} hint="Optional.">
            <input
              id={`${formId}-phone`}
              name="phone"
              type="tel"
              value={values.phone}
              onChange={(e) => set('phone', e.target.value)}
              autoComplete="tel"
              placeholder="+234 803 000 0000"
              className={`money ${field}`}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor={`${formId}-notes`} errors={errorsFor('notes')} hint="Optional.">
          <textarea
            id={`${formId}-notes`}
            name="notes"
            rows={4}
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Payment terms, who to chase, anything worth remembering"
            className="w-full rounded-sm border border-line-strong bg-transparent px-2.5 py-2 text-small text-ink placeholder:text-ink-muted"
          />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-xs text-small text-ink-secondary underline underline-offset-2 hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
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
