/**
 * The shape a form action hands back to `useActionState`.
 *
 * Deliberately NOT in `actions.ts`: a `'use server'` module may only export
 * async functions, because every export becomes a callable server endpoint.
 * Exporting the initial-state constant from there fails the build with
 * "A 'use server' file can only export async functions, found object" — which
 * is the framework protecting a real invariant, not a technicality to work
 * around. Types erase and so are fine either way; the constant needs a home
 * that both the actions and the client components can import.
 */
export type FormState = {
  status: 'idle' | 'error' | 'success';
  message?: string;
  /** Keyed by field path, e.g. `clientId` or `lineItems.2.unitAmount`. */
  fieldErrors?: Record<string, string[]>;
};

export const EMPTY_FORM_STATE: FormState = { status: 'idle' };
