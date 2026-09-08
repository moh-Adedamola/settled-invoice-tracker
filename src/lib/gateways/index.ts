import 'server-only';

import type { PaymentProvider } from '@/lib/db';

import { paystackAdapter } from './paystack';
import type { GatewayAdapter } from './types';

export type { GatewayAdapter, NormalizedEvent, NormalizedEventKind } from './types';
export { KIND_TO_PAYMENT_STATUS } from './types';

/**
 * Provider id → adapter.
 *
 * `stripe` and `flutterwave` are absent rather than stubbed. An adapter that
 * exists but does nothing would let the route return 200 for a provider we
 * cannot actually verify, which is worse than a 404: the sender would believe
 * the event was accepted and never retry it.
 */
const ADAPTERS: Partial<Record<PaymentProvider, GatewayAdapter>> = {
  paystack: paystackAdapter,
};

/**
 * Returns `undefined` for an unknown or unimplemented provider — never throws.
 * The route turns that into a 404, which is the honest answer for a URL that
 * does not correspond to anything we can process.
 */
export function getAdapter(provider: string): GatewayAdapter | undefined {
  return ADAPTERS[provider as PaymentProvider];
}

/** Providers currently accepting webhooks. Useful for health checks and docs. */
export function supportedProviders(): PaymentProvider[] {
  return Object.keys(ADAPTERS) as PaymentProvider[];
}
