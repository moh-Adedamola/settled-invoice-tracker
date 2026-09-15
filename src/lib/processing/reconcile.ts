import 'server-only';

import { sql } from 'drizzle-orm';

import { db, webhookEvents } from '@/lib/db';
import type { PaymentProvider } from '@/lib/db';
import { credentialsPresent, getRegisteredAdapter, supportedProviders } from '@/lib/gateways';
import { getGatewayStatus } from '@/lib/queries/settings';

/* ==========================================================================
   Reconciliation — the nightly gap-fill.
   ==========================================================================

   Webhooks get lost. A deploy lands mid-delivery, a gateway has an outage, a
   signature secret is rotated an hour before someone updates the dashboard.
   Every one of those turns a real payment into a payment that, as far as this
   system is concerned, never happened — and unlike most bugs it is SILENT. The
   invoice simply stays unpaid, and the first person to notice is a client being
   chased for money they already sent.

   This pass asks each gateway what it actually recorded and fills in what we
   are missing.

   ## It does not write payments. It writes events.

   The obvious implementation inserts payment rows directly. This one inserts
   `webhook_events` rows and lets the existing drain do the work, and that is the
   single most important decision in the file.

   Writing payments directly would mean reimplementing, in a second place:
   client resolution by provider id then email, the demo-boundary promotion
   rules, invoice matching from `invoiceRef`, the `is_demo` derivation from
   `livemode`, `refreshInvoiceStatus`, and the FX conversion to base currency.
   Two implementations of that, drifting apart, with the second one exercised
   only on nights something broke — the least-tested path handling the least
   understood cases.

   Feeding the queue means a swept payment and a webhook payment are the same
   record, processed by the same code, on the same schedule. The sweep's whole
   job is to put a row in a table.

   ## Same id as the webhook, on purpose

   The synthesised row carries the `provider_event_id` the webhook WOULD have
   carried — not a `recon:`-prefixed variant. A prefix reads well in an audit
   query and quietly breaks deduplication: two ids means two rows means two
   processing attempts, and the loser dies on the payments unique constraint,
   retries five times and pages someone over an ordinary race. The full argument
   is on `webhookEvents.source` in the schema, which is where provenance lives
   instead.

   ## What it reports

   A reconciliation that finds nothing and a reconciliation that is broken look
   identical from the outside — both are silence. So the summary is per-provider
   and counts every stage: how many transactions the gateway returned, how many
   we already had, how many gaps were filled, how many were races, and what
   errored. `checked === 0` with no error is itself worth seeing, because on a
   live integration it usually means the window or the credentials are wrong
   rather than that business was quiet.
   ========================================================================== */

/**
 * How far back each sweep looks.
 *
 * 48 hours against a nightly schedule means every transaction is swept at least
 * twice. That redundancy is the point: one missed cron run, one deploy during
 * the window, one rate-limit bail-out, and the next night still catches it.
 * Widening it further costs API calls for diminishing returns — a gap that
 * survives two sweeps is not a delivery failure, it is a bug in this file.
 */
export const RECONCILE_WINDOW_HOURS = 48;

export type ProviderReconciliation = {
  provider: PaymentProvider;
  /** Rows the gateway returned, including ones no adapter cared to normalise. */
  seen: number;
  /** Transactions that normalised into something we could act on. */
  checked: number;
  /** Already had a payment on (provider, providerPaymentId). */
  alreadyPresent: number;
  /** Gaps: no payment, and we wrote a fresh event for the drain. */
  filled: number;
  /**
   * No payment, but an unprocessed event for it was already queued — the drain
   * simply had not got to it yet. Not a gap, and not an error.
   */
  alreadyQueued: number;
  /** HTTP requests spent, so the API cost of a sweep is visible. */
  requests: number;
  error?: string;
};

export type ReconciliationSummary = {
  since: string;
  until: string;
  providers: ProviderReconciliation[];
  totals: {
    seen: number;
    checked: number;
    alreadyPresent: number;
    filled: number;
    alreadyQueued: number;
    errored: number;
  };
};

/* -------------------------------------------------------------------------- */

/**
 * Which providers to sweep: registered, and holding the credential they need.
 *
 * Reuses `getGatewayStatus` rather than re-reading `process.env`, so the
 * settings panel and the sweep can never disagree about what is configured.
 * A provider with no key is skipped silently — it is an install that never
 * wired up that gateway, not a fault.
 */
async function sweepableProviders(): Promise<PaymentProvider[]> {
  const statuses = await getGatewayStatus();
  const registered = new Set(supportedProviders());

  /*
   * `apiReady`, not webhook-ready. Sweeping needs the API key; taking webhooks
   * needs the signing secret. Stripe is the case where those differ, and an
   * install with only the `whsec_` would be swept pointlessly — every request
   * 401ing — if this checked the wrong one.
   */
  return statuses
    .filter((s) => registered.has(s.provider) && s.registered && s.apiReady)
    .map((s) => s.provider);
}

/**
 * One provider's sweep.
 *
 * Never throws: an error is recorded on the result and the caller moves to the
 * next provider. One gateway being down must not stop the others being
 * reconciled, and a sweep that dies halfway leaves no summary at all — which is
 * the outcome this whole file exists to avoid.
 */
export async function reconcileProvider(
  provider: PaymentProvider,
  since: Date,
  until: Date,
): Promise<ProviderReconciliation> {
  const result: ProviderReconciliation = {
    provider,
    seen: 0,
    checked: 0,
    alreadyPresent: 0,
    filled: 0,
    alreadyQueued: 0,
    requests: 0,
  };

  /*
   * `getRegisteredAdapter`, deliberately not `getAdapter`.
   *
   * `getAdapter` hides an adapter whose WEBHOOK credential is missing, because
   * the intake route should 404 for a gateway it cannot verify. Sweeping is the
   * other half: it needs the API credential and has no use for the signing
   * secret. A Stripe install holding only `sk_` can reconcile perfectly well,
   * and going through `getAdapter` would report "no adapter registered" for a
   * gateway this function had just been told was sweepable.
   */
  const adapter = getRegisteredAdapter(provider);
  if (!adapter) {
    result.error = 'No adapter implemented';
    return result;
  }

  if (!credentialsPresent(adapter.credentials.api)) {
    result.error = `Missing ${adapter.credentials.api.join(', ')}`;
    return result;
  }

  let swept;
  try {
    swept = await adapter.fetchTransactions(since, until);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }

  result.seen = swept.seen;
  result.requests = swept.requests;
  result.checked = swept.transactions.length;

  for (const { event, payload } of swept.transactions) {
    try {
      /*
       * Two questions, deliberately separate.
       *
       * A payment already recorded means the webhook arrived and was processed:
       * nothing to do. An EVENT already recorded but no payment means the
       * webhook arrived and the drain has not run yet, or is retrying it — also
       * nothing to do, and counting it as a filled gap would overstate what this
       * pass achieved every time it ran between an intake and a drain.
       *
       * One statement rather than two round trips, because the sweep runs this
       * per transaction and a busy window is a lot of latency otherwise.
       */
      const [state] = (
        await db.execute(sql`
          select
            exists (
              select 1 from payments
              where provider = ${provider}::payment_provider
                and provider_payment_id = ${event.providerPaymentId}
            ) as has_payment,
            exists (
              select 1 from webhook_events
              where provider = ${provider}::payment_provider
                and provider_event_id = ${event.providerEventId}
            ) as has_event
        `)
      ).rows as Array<{ has_payment: boolean; has_event: boolean }>;

      if (state?.has_payment) {
        result.alreadyPresent += 1;
        continue;
      }

      if (state?.has_event) {
        result.alreadyQueued += 1;
        continue;
      }

      /*
       * Written exactly as the intake route writes one.
       *
       * `signatureOk: true` because this did not arrive as an unverified POST —
       * it came back from an authenticated, TLS-pinned call to the gateway's own
       * API using our secret key. That is a STRONGER assurance than an HMAC on a
       * request anyone can send, not a weaker one. It matters because the drain
       * only ever selects `signature_ok = true`; writing false here would file
       * the gap in a queue nothing reads.
       *
       * `onConflictDoNothing` for the same reason the route uses it: a webhook
       * can land between the existence check above and this insert. That race is
       * ordinary and its correct outcome is silence.
       */
      const inserted = await db
        .insert(webhookEvents)
        .values({
          provider,
          providerEventId: event.providerEventId,
          payload,
          signatureOk: true,
          source: 'reconciliation',
        })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });

      if (inserted.length > 0) result.filled += 1;
      else result.alreadyQueued += 1;
    } catch (error) {
      /*
       * One transaction failing is not the sweep failing. Record the first
       * problem and keep going — a summary reporting nine fills and one error
       * is far more use than an exception that loses all ten.
       */
      const message = error instanceof Error ? error.message : String(error);
      result.error = result.error ? `${result.error}; ${message}` : message;
    }
  }

  return result;
}

/**
 * Sweeps every configured provider for the window.
 *
 * Sequential, not parallel. Gateways rate-limit per integration, and the sweep
 * has no deadline worth spending that budget on — a nightly job that takes
 * ninety seconds instead of thirty costs nothing, whereas a 429 costs a whole
 * provider's reconciliation.
 */
export async function reconcile(
  windowHours = RECONCILE_WINDOW_HOURS,
): Promise<ReconciliationSummary> {
  const until = new Date();
  const since = new Date(until.getTime() - windowHours * 3_600_000);

  const providers: ProviderReconciliation[] = [];
  for (const provider of await sweepableProviders()) {
    providers.push(await reconcileProvider(provider, since, until));
  }

  return {
    since: since.toISOString(),
    until: until.toISOString(),
    providers,
    totals: {
      seen: providers.reduce((n, p) => n + p.seen, 0),
      checked: providers.reduce((n, p) => n + p.checked, 0),
      alreadyPresent: providers.reduce((n, p) => n + p.alreadyPresent, 0),
      filled: providers.reduce((n, p) => n + p.filled, 0),
      alreadyQueued: providers.reduce((n, p) => n + p.alreadyQueued, 0),
      errored: providers.filter((p) => p.error).length,
    },
  };
}
