'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';

import { EMPTY_FORM_STATE, type FormState } from '@/lib/invoices/form-state';
import type { InvoiceFilterOptions } from '@/lib/queries/invoices';
import { currencySymbol, formatMinorDigits } from '@/lib/format';
import {
  caretAfterGrouping,
  groupDecimal,
  multiplyByQuantity,
  parseDecimalToMinor,
  parseQuantity,
  sanitiseMoneyInput,
} from '@/lib/money';
import { CURRENCIES, MAX_LINE_ITEMS } from '@/lib/invoices/form-schema';

/* ==========================================================================
   The invoice editor.
   ==========================================================================

   ## The total shown here is the total that gets written

   Not "close to" it. The running total below calls `multiplyByQuantity` and
   `parseDecimalToMinor` from `@/lib/money` — the same two functions the server
   action calls, on the same strings, producing the same bigints. That is not
   belt and braces: `invoice_line_items` carries a deferred trigger that rejects
   any write where the lines disagree with the invoice total, so a client that
   rounded differently would produce a form that fails on submit with an error
   about a sum the user cannot see and did nothing to cause.

   Sharing the functions is what makes agreement structural. Re-implementing the
   arithmetic here — even correctly — would make it a coincidence that holds
   until someone changes a rounding rule on one side.

   ## Every field is controlled, including the ones that look like they need not
   be

   React 19 resets an uncontrolled form field after a form action completes.
   Measured: submit with one bad unit price, and the line items — which are
   controlled — kept their values while the client, both dates and the
   description came back blank. The user fixes the one field the error names and
   silently loses four they never touched.

   So every input here is driven from state. `defaultValue` is the trap: it is
   the natural thing to write for a field that only needs an initial value, and
   it is exactly the thing that empties on a failed submit.

   ## Rows carry an identity

   Line rows are keyed on a generated id rather than an array index. Reordering
   or removing by index makes React reuse the DOM node underneath, so the value
   in a field can end up belonging to a different row than the label above it.
   The `position` sent to the server is the array order at submit time; the key
   is only ever used by React.
   ========================================================================== */

export type LineDraft = {
  key: string;
  description: string;
  quantity: string;
  unitAmount: string;
};

export type InvoiceFormInitial = {
  clientId: string;
  currency: string;
  issuedAt: string;
  dueAt: string;
  description: string;
  lineItems: Omit<LineDraft, 'key'>[];
};

let keySeed = 0;
const nextKey = () => `line-${(keySeed += 1)}`;

const blankLine = (): LineDraft => ({
  key: nextKey(),
  description: '',
  quantity: '1',
  unitAmount: '',
});

export function InvoiceForm({
  action,
  options,
  initial,
  invoiceId,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  options: InvoiceFilterOptions;
  initial: InvoiceFormInitial;
  invoiceId?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [header, setHeader] = useState({
    clientId: initial.clientId,
    currency: initial.currency,
    issuedAt: initial.issuedAt,
    dueAt: initial.dueAt,
    description: initial.description,
  });
  const currency = header.currency;
  const setField = <K extends keyof typeof header>(key: K, value: string) =>
    setHeader((current) => ({ ...current, [key]: value }));
  const [lines, setLines] = useState<LineDraft[]>(() =>
    initial.lineItems.length > 0
      ? initial.lineItems.map((l) => ({ ...l, key: nextKey() }))
      : [blankLine()],
  );

  const formId = useId();
  const symbol = currencySymbol(currency);
  const errorsFor = (path: string) => state.fieldErrors?.[path];

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const move = (index: number, delta: number) =>
    setLines((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return next;
    });

  /** Exactly what the server will compute, or null where the input is not yet valid. */
  const lineTotal = (line: LineDraft): bigint | null => {
    const quantity = parseQuantity(line.quantity);
    const unit = parseDecimalToMinor(line.unitAmount, currency);
    if (!quantity.ok || !unit.ok) return null;
    return multiplyByQuantity(quantity.value, unit.minor);
  };

  const totals = lines.map(lineTotal);
  const invoiceTotal = totals.reduce<bigint>((a, t) => a + (t ?? 0n), 0n);
  const incomplete = totals.some((t) => t === null);

  const field =
    'h-9 w-full rounded-sm border border-line-strong bg-transparent px-2.5 text-small text-ink';
  /*
   * A select keeps the `bg-overlay` ground that @layer base gives it, so no
   * `bg-transparent` here. The ground is not decoration: the OS draws the
   * native popup from the select and its options, and a transparent one leaves
   * the popup on the OS's own light ground with near-white text on it.
   */
  const selectField =
    'h-9 w-full rounded-sm border border-line-strong px-2.5 text-small text-ink';
  const label = 'text-micro uppercase text-ink-muted';

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="rounded-sm border border-failed-line border-l-[3px] border-l-failed bg-failed-bg px-3 py-2.5 text-small text-failed"
        >
          {state.message}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Client" htmlFor={`${formId}-client`} errors={errorsFor('clientId')}>
            <select
              id={`${formId}-client`}
              name="clientId"
              value={header.clientId}
              onChange={(e) => setField('clientId', e.target.value)}
              className={selectField}
            >
              <option value="">Choose a client</option>
              {options.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Currency" htmlFor={`${formId}-currency`} errors={errorsFor('currency')}>
            <select
              id={`${formId}-currency`}
              name="currency"
              value={currency}
              onChange={(e) => setField('currency', e.target.value)}
              className={selectField}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Issue date" htmlFor={`${formId}-issued`} errors={errorsFor('issuedAt')}>
            <input
              id={`${formId}-issued`}
              name="issuedAt"
              type="date"
              value={header.issuedAt}
              onChange={(e) => setField('issuedAt', e.target.value)}
              className={field}
            />
          </Field>

          <Field label="Due date" htmlFor={`${formId}-due`} errors={errorsFor('dueAt')}>
            <input
              id={`${formId}-due`}
              name="dueAt"
              type="date"
              value={header.dueAt}
              onChange={(e) => setField('dueAt', e.target.value)}
              className={field}
            />
          </Field>
        </div>

        <Field
          label="Description"
          htmlFor={`${formId}-description`}
          errors={errorsFor('description')}
        >
          <input
            id={`${formId}-description`}
            name="description"
            type="text"
            value={header.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="What this invoice covers, in one line"
            className={`${field} placeholder:text-ink-muted`}
          />
        </Field>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="rounded-md border border-line bg-surface">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-3">
          <h2 className="text-h3 text-ink">Line items</h2>
          <p className="text-small text-ink-muted">
            <span className="money">{lines.length}</span> of{' '}
            <span className="money">{MAX_LINE_ITEMS}</span>
          </p>
        </header>

        {errorsFor('lineItems') ? (
          <p role="alert" className="px-4 pt-3 text-small text-failed">
            {errorsFor('lineItems')!.join(' ')}
          </p>
        ) : null}

        <ul>
          {lines.map((line, index) => {
            const total = totals[index];
            return (
              <li
                key={line.key}
                className="flex flex-col gap-2 border-t border-line-subtle px-4 py-3 first:border-t-0"
              >
                <div className="flex items-center gap-2">
                  <span className="money w-5 shrink-0 text-micro text-ink-muted">
                    {index + 1}
                  </span>
                  <input
                    name={`lineItems.${index}.description`}
                    value={line.description}
                    onChange={(e) => updateLine(line.key, { description: e.target.value })}
                    placeholder="Description"
                    aria-label={`Line ${index + 1} description`}
                    className={`${field} placeholder:text-ink-muted`}
                  />
                  <RowControls
                    index={index}
                    count={lines.length}
                    onMove={move}
                    onRemove={() =>
                      setLines((current) =>
                        current.length === 1
                          ? current
                          : current.filter((l) => l.key !== line.key),
                      )
                    }
                  />
                </div>

                <div className="flex flex-wrap items-end gap-2 pl-7">
                  <LineField
                    label="Qty"
                    name={`lineItems.${index}.quantity`}
                    value={line.quantity}
                    onChange={(v) => updateLine(line.key, { quantity: v })}
                    errors={errorsFor(`lineItems.${index}.quantity`)}
                    width="w-24"
                  />
                  <LineField
                    label={`Unit (${symbol.trim()})`}
                    name={`lineItems.${index}.unitAmount`}
                    value={line.unitAmount}
                    onChange={(v) => updateLine(line.key, { unitAmount: v })}
                    errors={errorsFor(`lineItems.${index}.unitAmount`)}
                    width="w-40"
                    money
                  />
                  <div className="ml-auto flex flex-col items-end gap-1">
                    <span className={label}>Line total</span>
                    <span
                      data-line-total=""
                      className={`money text-small whitespace-nowrap ${
                        total === null ? 'text-ink-muted' : 'text-ink'
                      }`}
                    >
                      {total === null ? '—' : `${symbol}${formatMinorDigits(total)}`}
                    </span>
                  </div>
                </div>

                {errorsFor(`lineItems.${index}.description`) ? (
                  <p className="pl-7 text-micro text-failed">
                    {errorsFor(`lineItems.${index}.description`)!.join(' ')}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3">
          <button
            type="button"
            onClick={() => setLines((c) => (c.length >= MAX_LINE_ITEMS ? c : [...c, blankLine()]))}
            disabled={lines.length >= MAX_LINE_ITEMS}
            className="inline-flex h-8 items-center rounded-sm border border-line-strong px-3 text-small text-ink transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add line
          </button>

          <div className="flex items-baseline gap-3">
            <span className="text-small text-ink-secondary">Invoice total</span>
            <span
              data-invoice-total=""
              className="money text-h3 whitespace-nowrap text-ink"
            >
              <span className="currency-mark">{symbol}</span>
              {formatMinorDigits(invoiceTotal)}
            </span>
          </div>
        </div>

        {incomplete ? (
          <p className="border-t border-line-subtle px-4 py-2.5 text-micro text-ink-muted">
            Lines with an incomplete quantity or unit price are not counted in the
            total yet.
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
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
        <p className="text-micro text-ink-muted">Saved as a draft — nothing is sent yet.</p>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  errors,
  children,
}: {
  label: string;
  htmlFor: string;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-micro uppercase text-ink-muted">
        {label}
      </label>
      {children}
      {errors ? (
        <p role="alert" className="text-micro text-failed">
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

function LineField({
  label,
  name,
  value,
  onChange,
  errors,
  width,
  money = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  width: string;
  /** Group the whole part in threes as the user types. */
  money?: boolean;
}) {
  /*
   * Grouping has to reposition the caret itself. Inserting a separator to the
   * left of the caret pushes the text right while the caret stays at its old
   * index, so it walks backwards through the number as you type — 6700000
   * becomes 6,70|0,000 with the cursor stranded mid-figure. Counting the
   * significant characters before the caret and finding that same count in the
   * reformatted string is what holds it in place.
   */
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    if (!money) {
      onChange(input.value);
      return;
    }

    const caret = input.selectionStart ?? input.value.length;
    const significantBefore = input.value.slice(0, caret).replace(/[^\d.]/g, '').length;
    const formatted = groupDecimal(sanitiseMoneyInput(input.value));
    onChange(formatted);

    // After React has written the value back, not before.
    const next = caretAfterGrouping(formatted, significantBefore);
    requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(next, next);
    });
  };

  return (
    <div className={`flex flex-col gap-1 ${width}`}>
      <span className="text-micro uppercase text-ink-muted">{label}</span>
      {/* inputMode decimal, not type=number: a number input silently accepts
          exponent notation and lets the browser round, which is exactly the
          precision this ledger refuses to hand off. */}
      <input
        name={name}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        onChange={handleChange}
        className={`money h-9 w-full rounded-sm border px-2.5 text-right text-small text-ink ${
          errors ? 'border-failed' : 'border-line-strong'
        } bg-transparent`}
      />
      {errors ? (
        <p role="alert" className="text-micro text-failed">
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Reorder and remove.
 *
 * These were three identical bordered buttons in a row, which said that moving
 * a line and deleting one are the same kind of act. They are not: two are
 * positional and undone by pressing the other arrow, and the third destroys
 * work with nothing to undo it with.
 *
 * The separation is structural before it is chromatic. The arrows are one
 * segmented control — a single bordered group with a divider between them,
 * reading as a pair — and remove sits outside it across a gap, unbordered, so
 * the grouping alone distinguishes them for a reader who cannot see the colour
 * difference. Colour then reinforces it: remove is `ink-muted` at rest and
 * `failed` on hover and focus, which is the §3 destructive token.
 *
 * No confirmation, deliberately. §7 asks for one on actions that are
 * consequential or hard to undo, and this is neither — nothing is saved yet,
 * and re-adding a line costs three fields. A confirm on every removed row is
 * the kind of friction that teaches people to click through confirmations.
 */
function RowControls({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (index: number, delta: number) => void;
  onRemove: () => void;
}) {
  const arrow =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center text-small text-ink-secondary transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-row-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-30';

  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="flex items-center overflow-hidden rounded-sm border border-line-strong">
        <button
          type="button"
          className={arrow}
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label={`Move line ${index + 1} up`}
        >
          ↑
        </button>
        <span aria-hidden="true" className="h-5 w-px shrink-0 bg-line-strong" />
        <button
          type="button"
          className={arrow}
          onClick={() => onMove(index, 1)}
          disabled={index === count - 1}
          aria-label={`Move line ${index + 1} down`}
        >
          ↓
        </button>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={count === 1}
        aria-label={`Remove line ${index + 1}`}
        title={count === 1 ? 'An invoice needs at least one line' : undefined}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-small text-ink-muted transition-colors duration-[var(--duration-fast)] ease-standard hover:bg-failed-bg hover:text-failed focus-visible:text-failed disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
      >
        ✕
      </button>
    </div>
  );
}
