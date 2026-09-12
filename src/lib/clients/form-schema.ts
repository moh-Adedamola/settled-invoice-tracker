import { z } from 'zod';

/**
 * The client form's shape.
 *
 * Deliberately not server-only: the form imports it for its field names and the
 * action imports it to validate, so the two cannot drift.
 *
 * Email is validated but optional. A client you invoice by hand may genuinely
 * have no address on file, and refusing to record them until someone invents
 * one is how placeholder data gets into a ledger.
 */
export const clientFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'A client needs a name.')
    .max(120, 'Keep it under 120 characters.'),
  email: z.union([z.email('That does not look like an email address.'), z.literal('')]),
  phone: z.string().trim().max(40, 'Keep it under 40 characters.'),
  notes: z.string().trim().max(2000, 'Keep it under 2000 characters.'),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

/** A blank field is an absent value, not an empty one — so it stores as null. */
export const blankToNull = (value: string): string | null =>
  value.trim() === '' ? null : value.trim();
