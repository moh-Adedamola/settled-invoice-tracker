import 'server-only';

import type { PaymentProvider } from '@/lib/db';

import { paystackAdapter } from './paystack';
import { stripeAdapter } from './stripe';
import { flutterwaveAdapter } from './flutterwave';
import type { GatewayAdapter } from './types';

export type {
  GatewayAdapter,
  NormalizedEvent,
  NormalizedEventKind,
  SweepPage,
  SweptTransaction,
} from './types';
export { KIND_TO_PAYMENT_STATUS } from './types';

/**
 * Provider id → adapter. All three are implemented.
 *
 * Being in this map means the CODE exists, not that the gateway is usable. What
 * makes it usable is credentials, and the two are checked separately — see
 * `getAdapter`.
 */
const ADAPTERS: Partial<Record<PaymentProvider, GatewayAdapter>> = {
  paystack: paystackAdapter,
  stripe: stripeAdapter,
  flutterwave: flutterwaveAdapter,
};

/** True when every named variable is set to something other than whitespace. */
export function credentialsPresent(names: string[]): boolean {
  return names.every((name) => {
    const raw = process.env[name];
    return typeof raw === 'string' && raw.trim() !== '';
  });
}

/**
 * The adapter for a provider we can ACTUALLY verify a webhook for.
 *
 * ## Why the credential check lives here
 *
 * Until all three adapters existed, an unconfigured gateway 404'd for an
 * incidental reason: Stripe and Flutterwave were simply absent from the map.
 * Registering them removes that, and without this gate the behaviour would
 * silently change — a Stripe webhook to an install with no `whsec_` would stop
 * being "we don't handle this provider" (404) and become "signature rejected"
 * (401, plus a quarantined row in `webhook_events`).
 *
 * 401 is not wrong exactly, but it is a worse answer. It tells a sender the
 * endpoint exists and their signature failed, which sends whoever is debugging
 * to look at secrets and signing when the real answer is that this deployment
 * was never configured for that gateway at all. It also accumulates unverified
 * rows for events nobody can ever process.
 *
 * So an adapter without its webhook credential is treated as not present, and
 * the route 404s exactly as before. Registering an adapter can no longer change
 * how an unconfigured install behaves.
 *
 * Returns `undefined` for an unknown provider too — never throws.
 */
export function getAdapter(provider: string): GatewayAdapter | undefined {
  const adapter = ADAPTERS[provider as PaymentProvider];
  if (!adapter) return undefined;
  return credentialsPresent(adapter.credentials.webhook) ? adapter : undefined;
}

/**
 * The adapter regardless of credentials.
 *
 * For callers asking "is this implemented", not "can we use it" — the settings
 * panel needs to report an unconfigured-but-implemented gateway as exactly
 * that, which it cannot do if the only accessor hides it.
 */
export function getRegisteredAdapter(provider: string): GatewayAdapter | undefined {
  return ADAPTERS[provider as PaymentProvider];
}

/** Every provider with an implementation, configured or not. */
export function supportedProviders(): PaymentProvider[] {
  return Object.keys(ADAPTERS) as PaymentProvider[];
}

/** Providers whose webhook route will currently accept anything. */
export function configuredProviders(): PaymentProvider[] {
  return supportedProviders().filter((provider) => getAdapter(provider) !== undefined);
}
