import { z } from 'zod';

import { CURRENCIES } from '@/lib/invoices/form-schema';

/**
 * The manual-payment form's shape.
 *
 * Not server-only: the form imports it for its field names and the action
 * imports it to validate, so the two cannot drift.
 *
 * ## Why the method is a closed list plus a note
 *
 * `payments.method` is free text in the schema because a gateway supplies
 * whatever it likes ('card', 'bank_debit', 'ussd', 'mobile_money'). A human
 * typing into a box would produce 'Transfer', 'transfer', 'bank transfer' and
 * 'BANK TRANSFER' inside a month, and then the provider column stops being
 * something you can group by. The list below is what a Lagos agency actually
 * receives money as; `other` exists so the list never becomes a reason to
 * record the payment wrongly.
 */
export const MANUAL_METHODS = [
  'bank_transfer',
  'cash',
  'cheque',
  'pos',
  'ussd',
  'other',
] as const;

export type ManualMethod = (typeof MANUAL_METHODS)[number];

export const MANUAL_METHOD_LABELS: Record<ManualMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  pos: 'POS terminal',
  ussd: 'USSD',
  other: 'Other',
};

/**
 * The statuses a person may record by hand.
 *
 * Deliberately not all four. `refunded` is excluded: a refund is a reversal of
 * a specific earlier payment, and recording a standalone refunded row that
 * points at nothing would put money in the ledger that never arrived and never
 * left. When refunds need recording by hand they need their own flow, against
 * the payment being reversed.
 */
export const MANUAL_STATUSES = ['succeeded', 'pending', 'failed'] as const;

export const MANUAL_STATUS_LABELS: Record<(typeof MANUAL_STATUSES)[number], string> = {
  succeeded: 'Received',
  pending: 'Expected',
  failed: 'Failed',
};

export const manualPaymentSchema = z.object({
  clientId: z.uuid('Choose the client this money came from.'),
  /** Empty string means "not against a specific invoice", which is a real case. */
  invoiceId: z.union([z.uuid('That invoice no longer exists.'), z.literal('')]),
  amount: z.string().trim().min(1, 'Enter the amount received.'),
  currency: z.enum(CURRENCIES, 'Choose a currency.'),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the date this money moved.'),
  method: z.enum(MANUAL_METHODS, 'Choose how it arrived.'),
  status: z.enum(MANUAL_STATUSES, 'Choose a status.'),
  /** Free text, shown on the payment. Optional. */
  note: z.string().trim().max(200, 'Keep it under 200 characters.'),
});

export type ManualPaymentValues = z.infer<typeof manualPaymentSchema>;

export const EMPTY_MANUAL_PAYMENT: ManualPaymentValues = {
  clientId: '',
  invoiceId: '',
  amount: '',
  currency: 'NGN',
  occurredOn: '',
  method: 'bank_transfer',
  status: 'succeeded',
  note: '',
};

/**
 * `method` as it is stored: the chosen kind, with the note appended.
 *
 * The note has no column of its own, and adding one for it would be the wrong
 * trade — `method` is already free text and this is a description of how the
 * money arrived, which is exactly what `method` holds. The rule that matters is
 * that nothing collected is discarded: a note typed into this form is rendered
 * on the payment's detail page and in its row, because it is part of the
 * method string.
 */
export function composeMethod(method: ManualMethod, note: string): string {
  const label = MANUAL_METHOD_LABELS[method];
  const trimmed = note.trim();
  return trimmed === '' ? label : `${label} — ${trimmed}`;
}
