import type { Metadata } from 'next';

import { requireAdmin } from '@/lib/auth/guard';
import { getGatewayStatus, getSettings } from '@/lib/queries/settings';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/components/shell/page-header';
import { PresenceMark } from '@/components/ui/presence-mark';
import { telegramConfigured } from '@/lib/notify/telegram';
import {
  BusinessDetailsForm,
  NotificationSettingsForm,
  PasswordChangeForm,
  ReminderSettingsForm,
} from '@/components/settings/settings-forms';

export const metadata: Metadata = { title: 'Settings · Settled' };
export const dynamic = 'force-dynamic';

/**
 * `requireAdmin`, not `requireUser`.
 *
 * Every panel on this page exists to change something, and the one read-only
 * panel is a credential inventory. There is no version of this page worth
 * showing to someone who cannot act on it — and unlike the ledger, where a
 * viewer has a legitimate read, "which gateways are configured" is not a fact a
 * read-only visitor has any business with.
 *
 * A signed-in viewer is sent to the dashboard rather than to /login: bouncing an
 * authenticated user to a login form reads as "your session broke" rather than
 * "you lack permission". A signed-out visitor goes to /login as everywhere.
 */
export default async function SettingsPage() {
  await requireAdmin();

  const [settings, gateways] = await Promise.all([getSettings(), getGatewayStatus()]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="What this business is called, when it chases, and where it shouts."
      />

      <div className="flex flex-col gap-6 px-6 py-6">
        {!settings.persisted ? (
          <p
            role="alert"
            className="rounded-sm border border-overdue-line border-l-[3px] border-l-overdue bg-overdue-bg px-3 py-2.5 text-small text-overdue"
          >
            No settings row was found, so the values below are defaults that have
            not been saved. Saving any panel will create it.
          </p>
        ) : null}

        <BusinessDetailsForm
          initial={{
            businessName: settings.businessName,
            businessAddress: settings.businessAddress,
            businessEmail: settings.businessEmail,
            businessPhone: settings.businessPhone,
          }}
        />

        <ReminderSettingsForm
          initial={{
            remindersEnabled: settings.remindersEnabled,
            reminderDay1: settings.reminderDay1,
            reminderDay2: settings.reminderDay2,
            reminderDay3: settings.reminderDay3,
          }}
        />

        <NotificationSettingsForm
          botTokenPresent={telegramConfigured()}
          initial={{
            telegramChatId: settings.telegramChatId,
            alertOnPaymentSuccess: settings.alertOnPaymentSuccess,
            alertOnPaymentFailure: settings.alertOnPaymentFailure,
          }}
        />

        <GatewayPanel gateways={gateways} />

        <PasswordChangeForm />

        {settings.persisted ? (
          <p className="px-1 text-micro text-ink-muted">
            Last changed {formatDateTime(settings.updatedAt)}.
          </p>
        ) : null}
      </div>
    </>
  );
}

/**
 * Gateways: registered, and whether the credential exists. Nothing more.
 *
 * ## Present or absent, never a masked key
 *
 * A masked key is not a redaction, it is a confirmation. `sk_live_••••4f2a`
 * tells anyone reading over a shoulder that the account is live rather than
 * test, and the visible characters are enough to match against a key seen
 * elsewhere. The question this panel answers is "will a webhook from Paystack
 * verify today", and "present" answers it completely. Anyone who needs to know
 * WHICH key is configured has to look where the key actually lives.
 *
 * The env var's NAME is shown, because that is the actionable half: it is what
 * someone has to go and set, and it is not a secret.
 */
function GatewayPanel({
  gateways,
}: {
  gateways: Awaited<ReturnType<typeof getGatewayStatus>>;
}) {
  return (
    <section
      aria-labelledby="gateways-heading"
      className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="gateways-heading" className="text-h3 text-ink">
          Payment gateways
        </h2>
        <p className="max-w-[70ch] text-small text-ink-muted">
          Read-only. Keys are set in the environment and are never shown here —
          not even partly, since a masked key still tells you which account is
          configured.
        </p>
      </div>

      <ul className="overflow-hidden rounded-md border border-line">
        {gateways.map((gateway) => (
          <li
            key={gateway.provider}
            className="flex flex-col gap-2 border-t border-line-subtle px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-small text-ink">{gateway.label}</span>
              <span className="money text-micro text-ink-muted">
                {[...gateway.webhookEnvVars, ...gateway.apiEnvVars]
                  .filter((v, i, all) => all.indexOf(v) === i)
                  .join(' · ')}
                {gateway.paymentCount > 0 ? (
                  <span className="text-ink-secondary">
                    {' · '}
                    {gateway.paymentCount}{' '}
                    {gateway.paymentCount === 1 ? 'payment' : 'payments'} recorded
                  </span>
                ) : null}
              </span>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <PresenceMark
                ok={gateway.registered}
                yes="Adapter built"
                no="No adapter"
                explainNo="No code exists for this provider."
              />
              {/*
                Webhooks and reconciliation are marked separately because they
                need different credentials — Stripe verifies with a `whsec_`
                endpoint secret and sweeps with an `sk_` API key. One tick for
                both would call a Stripe install with only half of them ready.
              */}
              <PresenceMark
                ok={gateway.webhookReady}
                yes="Webhooks on"
                no="Webhooks off"
                explainNo="Without its signing secret this provider's webhook URL answers 404."
              />
              <PresenceMark
                ok={gateway.apiReady}
                yes="Sweep on"
                no="Sweep off"
                explainNo="Reconciliation skips this provider, so a lost webhook stays lost."
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}


