import 'server-only';

import type { PaymentProvider } from '@/lib/db';
import { formatMinor } from '@/lib/format';
import { PROVIDER_LABEL } from '@/components/payments/payment-bits';

import { escape } from './telegram';

/* ==========================================================================
   What the three alerts actually say.
   ==========================================================================

   Written for a lock screen. Telegram shows roughly the first line in the
   notification, so the first line carries the event and the money and nothing
   else; the detail sits below for whoever opens it.

   Bold is spent once, on the amount, because that is the figure the eye goes
   to and the one worth being able to find without reading. Everything else is
   plain — a message where four things are bold has nothing emphasised.

   Every interpolated value goes through `escape`. `formatMinor` and the
   provider labels are ours and contain no markup, but they are escaped anyway:
   the rule "everything interpolated is escaped" survives someone later adding
   a currency whose symbol is `<`, and a rule with exceptions is one that gets
   forgotten at the one call site that mattered.
   ========================================================================== */

export type PaymentAlertFacts = {
  clientName: string | null;
  invoiceNumber: string | null;
  amountMinor: bigint;
  currency: string;
  provider: PaymentProvider;
  method: string | null;
};

/** "Harbor & Finch" or, when the payment matched no client, a plain marker. */
function who(clientName: string | null): string {
  return clientName ? escape(clientName) : 'unknown payer';
}

/**
 * The invoice line, or the marker that stands in for it.
 *
 * An unmatched payment is money that arrived with nothing to attach it to, and
 * it is the one case in this whole flow that needs a person. Saying so in the
 * alert is the point — a blank where the invoice number goes reads as a
 * formatting bug, not as work waiting.
 */
function against(invoiceNumber: string | null): string {
  return invoiceNumber ? `Invoice ${escape(invoiceNumber)}` : 'Unmatched — needs matching';
}

function providerLine(provider: PaymentProvider, method: string | null): string {
  const label = escape(PROVIDER_LABEL[provider] ?? provider);
  return method ? `${label} · ${escape(method)}` : label;
}

export function paymentSucceededMessage(facts: PaymentAlertFacts): string {
  const amount = escape(formatMinor(facts.amountMinor, facts.currency));
  return [
    `💸 Payment received — <b>${amount}</b>`,
    `${who(facts.clientName)} · ${against(facts.invoiceNumber)}`,
    providerLine(facts.provider, facts.method),
  ].join('\n');
}

/**
 * The same facts, framed as needing attention.
 *
 * Deliberately the same three lines in the same order. Two alerts about the
 * same payment that differ in shape as well as wording are two things to learn
 * to read; keeping the layout fixed means the only thing that changed is the
 * one word that matters.
 */
export function paymentFailedMessage(facts: PaymentAlertFacts): string {
  const amount = escape(formatMinor(facts.amountMinor, facts.currency));
  return [
    `⚠️ Payment failed — <b>${amount}</b>`,
    `${who(facts.clientName)} · ${against(facts.invoiceNumber)}`,
    `${providerLine(facts.provider, facts.method)} — may need chasing`,
  ].join('\n');
}

export type ProcessingFailureFacts = {
  provider: PaymentProvider;
  providerEventId: string;
  attempts: number;
  error: string | null;
};

/**
 * The operational one.
 *
 * Names the provider's own event id rather than our row id, because that is the
 * string you can paste into the gateway's dashboard to see what it was. The
 * error is truncated hard — a stack trace on a lock screen is a wall, and the
 * full text is on the row for whoever goes looking.
 */
export function processingFailureMessage(facts: ProcessingFailureFacts): string {
  const reason = (facts.error ?? 'no error recorded')
    .replace(/^GIVING UP:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

  return [
    `🛑 Event stuck after ${facts.attempts} attempts`,
    `${escape(PROVIDER_LABEL[facts.provider] ?? facts.provider)} · ${escape(facts.providerEventId)}`,
    escape(reason),
    'Not retrying. A payment may be missing.',
  ].join('\n');
}
