'use client';

import { useActionState, useId, useMemo, useState } from 'react';
import Link from 'next/link';

import { recordManualPayment } from '@/app/(app)/payments/actions';
import { EMPTY_FORM_STATE } from '@/lib/invoices/form-state';
import { CURRENCIES } from '@/lib/invoices/form-schema';
import {
  EMPTY_MANUAL_PAYMENT,
  MANUAL_METHODS,
  MANUAL_METHOD_LABELS,
  MANUAL_STATUSES,
  MANUAL_STATUS_LABELS,
  type ManualPaymentValues,
} from '@/lib/payments/form-schema';
import {
  caretAfterGrouping,
  groupDecimal,
  sanitiseMoneyInput,
} from '@/lib/money';
import { currencySymbol, formatMinorDigits } from '@/lib/format';

export type OpenInvoice = {
  id: string;
  number: string;
  clientId: string;
  currency: string;
  outstandingMinor: bigint;
};

/**
 * Recording money that never came through a gateway.
 *
 * Every field is driven from state, never `defaultValue`. React 19 resets an
 * uncontrolled field once a form action completes, so a failed submit would
 * blank every field the error did not name — measured on the invoice form,
 * where a bad unit price wiped the client, both dates and the description.
 *
 * ## The invoice picker narrows itself
 *
 * It offers only invoices belonging to the chosen client AND in the chosen
 * currency. Both narrowings are the same rule the matching flow enforces in
 * SQL, applied a step earlier so the impossible pairing is never on screen to
 * be chosen. Changing the client or the currency clears a selection that no
 * longer qualifies — leaving a stale id in a hidden field is how a form submits
 * something the user can no longer see.
 *
 * Leaving the invoice unset is a first-class choice, not an incomplete form: a
 * cash deposit against no particular invoice is an ordinary event, and the
 * payment lands in the unmatched queue where it can be placed later.
 */
export function ManualPaymentForm({
  clients,
  invoices,
  defaultCurrency,
}: {
  clients: Array<{ id: string; name: string }>;
  invoices: OpenInvoice[];
  defaultCurrency: string;
}) {
  const [state, formAction, pending] = useActionState(
    recordManualPayment,
    EMPTY_FORM_STATE,
  );
  const [values, setValues] = useState<ManualPaymentValues>({
    ...EMPTY_MANUAL_PAYMENT,
    currency: (CURRENCIES as readonly string[]).includes(defaultCurrency)
      ? (defaultCurrency as ManualPaymentValues['currency'])
      : 'NGN',
    occurredOn: new Date().toISOString().slice(0, 10),
  });
  const formId = useId();

  const set = <K extends keyof ManualPaymentValues>(
    key: K,
    value: ManualPaymentValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const eligible = useMemo(
    () =>
      invoices.filter(
        (i) => i.clientId === values.clientId && i.currency === values.currency,
      ),
    [invoices, values.clientId, values.currency],
  );

  // A selection that no longer qualifies is dropped rather than carried.
  const invoiceId = eligible.some((i) => i.id === values.invoiceId)
    ? values.invoiceId
    : '';

  const errorsFor = (path: string) => state.fieldErrors?.[path];

  const field =
    'h-9 w-full rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink placeholder:text-ink-muted';
  const selectField =
    'h-9 w-full rounded-sm border border-line-strong px-2.5 text-small text-ink';

  const handleAmount = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    const significantBefore = input.value.slice(0, caret).replace(/[^\d.]/g, '').length;
    const formatted = groupDecimal(sanitiseMoneyInput(input.value));
    set('amount', formatted);
    const next = caretAfterGrouping(formatted, significantBefore);
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(next, next);
    });
  };

  return (
    <form action={formAction} className="flex max-w-[70ch] flex-col gap-6">
      {/* The picker drops a selection that stopped qualifying, so the hidden
          field carries what is actually shown rather than what was once set. */}
      <input type="hidden" name="invoiceId" value={invoiceId} />

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="rounded-sm border border-failed-line border-l-[3px] border-l-failed bg-failed-bg px-3 py-2.5 text-small text-failed"
        >
          {state.message}
        </p>
      ) : null}

      <section className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4">
        <Field label="Client" htmlFor={`${formId}-client`} errors={errorsFor('clientId')} required>
          <select
            id={`${formId}-client`}
            name="clientId"
            value={values.clientId}
            onChange={(e) => set('clientId', e.target.value)}
            className={selectField}
          >
            <option value="">Choose a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
          <Field
            label="Amount"
            htmlFor={`${formId}-amount`}
            errors={errorsFor('amount')}
            required
          >
            <div className="flex items-center gap-2">
              <span className="money text-small text-ink-muted">
                {currencySymbol(values.currency)}
              </span>
              {/* inputMode decimal, not type=number: a number input accepts
                  exponent notation and lets the browser round — precisely the
                  precision this ledger refuses to hand off. */}
              <input
                id={`${formId}-amount`}
                name="amount"
                value={values.amount}
                onChange={handleAmount}
                inputMode="decimal"
                autoComplete="off"
                placeholder="250,000.00"
                className={`money ${field} text-right`}
              />
            </div>
          </Field>

          <Field label="Currency" htmlFor={`${formId}-currency`} errors={errorsFor('currency')}>
            <select
              id={`${formId}-currency`}
              name="currency"
              value={values.currency}
              onChange={(e) =>
                set('currency', e.target.value as ManualPaymentValues['currency'])
              }
              className={selectField}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Against invoice"
          htmlFor={`${formId}-invoice`}
          errors={errorsFor('invoiceId')}
          hint={
            values.clientId === ''
              ? 'Choose a client first.'
              : eligible.length === 0
                ? `No open ${values.currency} invoice for this client — it will go to the unmatched queue.`
                : 'Optional. Leave unset and it queues for matching later.'
          }
        >
          <select
            id={`${formId}-invoice`}
            value={invoiceId}
            onChange={(e) => set('invoiceId', e.target.value)}
            disabled={eligible.length === 0}
            className={`${selectField} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <option value="">No specific invoice</option>
            {eligible.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.number} — {currencySymbol(invoice.currency)}
                {formatMinorDigits(invoice.outstandingMinor)} outstanding
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date received" htmlFor={`${formId}-date`} errors={errorsFor('occurredOn')} required>
            <input
              id={`${formId}-date`}
              name="occurredOn"
              type="date"
              value={values.occurredOn}
              onChange={(e) => set('occurredOn', e.target.value)}
              className={field}
            />
          </Field>

          <Field label="Status" htmlFor={`${formId}-status`} errors={errorsFor('status')}>
            <select
              id={`${formId}-status`}
              name="status"
              value={values.status}
              onChange={(e) =>
                set('status', e.target.value as ManualPaymentValues['status'])
              }
              className={selectField}
            >
              {MANUAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {MANUAL_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="How it arrived" htmlFor={`${formId}-method`} errors={errorsFor('method')}>
            <select
              id={`${formId}-method`}
              name="method"
              value={values.method}
              onChange={(e) =>
                set('method', e.target.value as ManualPaymentValues['method'])
              }
              className={selectField}
            >
              {MANUAL_METHODS.map((method) => (
                <option key={method} value={method}>
                  {MANUAL_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Note"
            htmlFor={`${formId}-note`}
            errors={errorsFor('note')}
            hint="Optional — shown on the payment, beside the method."
          >
            <input
              id={`${formId}-note`}
              name="note"
              type="text"
              value={values.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Teller name, cheque number, who handed it over"
              className={field}
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="ring-inverse inline-flex h-9 items-center rounded-sm bg-accent px-3.5 text-small font-medium text-accent-fg transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Recording…' : 'Record payment'}
        </button>
        <Link
          href="/payments"
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
