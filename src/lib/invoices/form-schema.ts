import { z } from 'zod';

import { multiplyByQuantity, parseDecimalToMinor, parseQuantity } from '@/lib/money';

/* ==========================================================================
   The invoice form's shape, shared by the client and the server action.
   ==========================================================================

   Deliberately NOT server-only. The form imports it to compute the running
   total the user watches, and the action imports it to compute the total that
   actually gets written. One module means the two cannot drift: if they
   disagree by a kobo the deferred trigger rejects the write and the user is
   shown an error about a sum they cannot see and did not cause.
   ========================================================================== */

export const MAX_LINE_ITEMS = 20;
export const CURRENCIES = ['NGN', 'USD', 'GBP'] as const;

/** YYYY-MM-DD, as an <input type="date"> produces. */
const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.');

export const lineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, 'Describe what this line is for.')
    .max(200, 'Keep it under 200 characters.'),
  quantity: z.string().trim().min(1, 'Required.'),
  unitAmount: z.string().trim().min(1, 'Required.'),
});

export const invoiceFormSchema = z.object({
  clientId: z.uuid('Choose a client.'),
  currency: z.enum(CURRENCIES, 'Choose a currency.'),
  issuedAt: z.union([dateString, z.literal('')]),
  dueAt: z.union([dateString, z.literal('')]),
  description: z.string().trim().max(300, 'Keep it under 300 characters.'),
  lineItems: z
    .array(lineItemSchema)
    .min(1, 'An invoice needs at least one line.')
    .max(MAX_LINE_ITEMS, `No more than ${MAX_LINE_ITEMS} lines.`),
});

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

/* --------------------------------------------------------------------------
   Money, which zod cannot check on its own
   -------------------------------------------------------------------------- */

export type LineComputation = {
  quantity: string;
  unitAmountMinor: bigint;
  lineAmountMinor: bigint;
};

export type MoneyIssue = { path: string; message: string };

const MONEY_MESSAGES: Record<string, string> = {
  empty: 'Required.',
  malformed: 'Numbers only, e.g. 1250.00',
  negative: 'Cannot be negative.',
  'too-precise': 'Too many decimal places for this currency.',
  'too-large': 'That figure is implausibly large.',
};

const QUANTITY_MESSAGES: Record<string, string> = {
  empty: 'Required.',
  malformed: 'Up to three decimal places, e.g. 2.5',
  zero: 'Must be more than zero.',
  'too-large': 'That quantity is implausibly large.',
};

/**
 * Turns the validated strings into the exact minor-unit figures that will be
 * written, or into field-level messages.
 *
 * The line total is `round(quantity × unit)` with ties away from zero, which is
 * `multiplyByQuantity` — the same function the stored demo line totals came
 * from, and the same one the browser calls while the user types.
 */
export function computeLines(
  values: InvoiceFormValues,
): { ok: true; lines: LineComputation[]; totalMinor: bigint } | { ok: false; issues: MoneyIssue[] } {
  const issues: MoneyIssue[] = [];
  const lines: LineComputation[] = [];

  values.lineItems.forEach((item, index) => {
    const quantity = parseQuantity(item.quantity);
    const unit = parseDecimalToMinor(item.unitAmount, values.currency);

    if (!quantity.ok) {
      issues.push({
        path: `lineItems.${index}.quantity`,
        message: QUANTITY_MESSAGES[quantity.reason] ?? 'Invalid quantity.',
      });
    }
    if (!unit.ok) {
      issues.push({
        path: `lineItems.${index}.unitAmount`,
        message: MONEY_MESSAGES[unit.reason] ?? 'Invalid amount.',
      });
    }
    if (!quantity.ok || !unit.ok) return;

    const lineAmountMinor = multiplyByQuantity(quantity.value, unit.minor);
    if (lineAmountMinor <= 0n) {
      issues.push({
        path: `lineItems.${index}.unitAmount`,
        message: 'This line comes to zero.',
      });
      return;
    }

    lines.push({
      quantity: quantity.value,
      unitAmountMinor: unit.minor,
      lineAmountMinor,
    });
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, lines, totalMinor: lines.reduce((a, l) => a + l.lineAmountMinor, 0n) };
}

/**
 * A date from the form, read as noon UTC.
 *
 * Midnight would be the obvious choice and is wrong here: Lagos is UTC+1, so
 * midnight UTC on the 5th is 01:00 on the 5th locally, but midnight UTC on a
 * date entered from a UTC-5 timezone lands on the previous evening. Noon is far
 * enough from both edges that the calendar day survives the round trip in every
 * timezone this ledger is read in.
 */
export function dateFromForm(value: string): Date | null {
  if (value === '') return null;
  return new Date(`${value}T12:00:00.000Z`);
}

/** The inverse, for populating the edit form. */
export function dateToForm(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : '';
}
