import 'server-only';

import { cache } from 'react';
import { eq, sql } from 'drizzle-orm';

import { db, appSettings } from '@/lib/db';
import type { AppSettings, PaymentProvider } from '@/lib/db';
import { supportedProviders } from '@/lib/gateways';

/* ==========================================================================
   Application settings.
   ==========================================================================

   One row, read through `cache` so a page that shows settings in three places
   reads them once. The row is created by migration 0004, so every read after
   that migration finds one — but `getSettings` still falls back rather than
   throwing, because a settings page that 500s is a settings page nobody can use
   to fix whatever broke.
   ========================================================================== */

/**
 * Used only when the singleton row is somehow absent.
 *
 * These duplicate the column defaults, which is a second copy and therefore a
 * thing that can drift. It is deliberate and narrow: the database is the source
 * of truth in every normal case, and this exists so the page renders at all in
 * the one case where it is not. The values are the conservative reading —
 * reminders on with the historical 3/7/14 ladder, alerts off except failures.
 */
const FALLBACK: Omit<AppSettings, 'id' | 'updatedAt'> = {
  businessName: 'Settled',
  businessAddress: '',
  businessEmail: '',
  businessPhone: '',
  remindersEnabled: true,
  reminderDay1: 3,
  reminderDay2: 7,
  reminderDay3: 14,
  telegramChatId: '',
  alertOnPaymentSuccess: false,
  alertOnPaymentFailure: true,
};

export type Settings = Omit<AppSettings, 'id'> & {
  /** False when the singleton row was missing and FALLBACK was used. */
  persisted: boolean;
};

export const getSettings = cache(async (): Promise<Settings> => {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, true)).limit(1);

  if (!row) {
    return { ...FALLBACK, updatedAt: new Date(0), persisted: false };
  }

  // `id` is the singleton latch and means nothing to a caller.
  const { id, ...rest } = row;
  void id;
  return { ...rest, persisted: true };
});

/** The ladder as a list, which is how every consumer actually wants it. */
export function reminderLadder(settings: Settings): number[] {
  return [settings.reminderDay1, settings.reminderDay2, settings.reminderDay3];
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

/*
 * Each write is an UPSERT on the singleton, not an UPDATE.
 *
 * An UPDATE against a missing row succeeds and changes nothing, which is the
 * failure mode this codebase keeps designing against: the user is told it
 * worked and it did not. `on conflict (id) do update` writes the row whether or
 * not it was there, and the CHECK constraints apply either way.
 *
 * Only the columns a form owns are written. Three forms share one row, and a
 * whole-row write from the business form would silently revert a ladder change
 * made in another tab.
 */

export type BusinessDetailsInput = {
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  businessPhone: string;
};

export async function saveBusinessDetails(input: BusinessDetailsInput): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: true, ...input })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { ...input, updatedAt: sql`now()` },
    });
}

export type ReminderSettingsInput = {
  remindersEnabled: boolean;
  reminderDay1: number;
  reminderDay2: number;
  reminderDay3: number;
};

export type ReminderSaveResult =
  | { ok: true }
  | { ok: false; reason: 'ladder-rejected'; detail: string };

/**
 * The ladder, with the database's own verdict surfaced rather than assumed.
 *
 * The form validates the same rules first, so this catch is for the cases the
 * form cannot see: a concurrent write, or a future caller that skipped the
 * form. Turning a constraint violation into a sentence is the difference
 * between "something went wrong" and a user who knows what to change.
 */
export async function saveReminderSettings(
  input: ReminderSettingsInput,
): Promise<ReminderSaveResult> {
  try {
    await db
      .insert(appSettings)
      .values({ id: true, ...input })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { ...input, updatedAt: sql`now()` },
      });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/app_settings_reminder/.test(message)) {
      return {
        ok: false,
        reason: 'ladder-rejected',
        detail: 'The database refused that ladder. Days must ascend, start at 1 or more, and end within a year.',
      };
    }
    throw error;
  }
}

export type NotificationSettingsInput = {
  telegramChatId: string;
  alertOnPaymentSuccess: boolean;
  alertOnPaymentFailure: boolean;
};

export async function saveNotificationSettings(
  input: NotificationSettingsInput,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({ id: true, ...input })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { ...input, updatedAt: sql`now()` },
    });
}

/* -------------------------------------------------------------------------- */
/* Gateway status — read only, and deliberately incurious                     */
/* -------------------------------------------------------------------------- */

export type GatewayStatus = {
  provider: PaymentProvider;
  label: string;
  /** An adapter exists and the webhook route will accept this provider. */
  registered: boolean;
  /** The credential this adapter needs is set in the environment. */
  credentialPresent: boolean;
  /** The env var's NAME. Never its value. */
  credentialEnvVar: string;
  /** Payments recorded against this provider, so the panel shows live evidence. */
  paymentCount: number;
};

/**
 * Which adapters are wired up, and whether each has what it needs.
 *
 * ## Present or absent. Never the key, never a masked key.
 *
 * A masked key is not a redaction, it is a confirmation. `sk_live_••••4f2a`
 * tells a shoulder-surfer the account is live rather than test, and the last
 * four characters are enough to match against a key they have seen elsewhere.
 * There is no question this page needs to answer that "present" does not
 * answer: someone who needs to know WHICH key is configured has to look where
 * the key actually lives.
 *
 * So this reads `process.env.X !== undefined` and discards everything else. The
 * value never enters a return type, which means it cannot reach a client
 * component by accident.
 */
const CREDENTIALS: Record<PaymentProvider, { label: string; envVar: string }> = {
  paystack: { label: 'Paystack', envVar: 'PAYSTACK_SECRET_KEY' },
  stripe: { label: 'Stripe', envVar: 'STRIPE_SECRET_KEY' },
  flutterwave: { label: 'Flutterwave', envVar: 'FLUTTERWAVE_SECRET_KEY' },
  manual: { label: 'Manual entry', envVar: '' },
};

export const getGatewayStatus = cache(async (): Promise<GatewayStatus[]> => {
  const registered = new Set(supportedProviders());

  const counts = new Map<string, number>(
    ((
      await db.execute(sql`
        select provider::text as provider, count(*)::int as n from payments group by provider
      `)
    ).rows as Record<string, unknown>[]).map((r) => [String(r.provider), Number(r.n)]),
  );

  return (Object.keys(CREDENTIALS) as PaymentProvider[])
    // `manual` is not a gateway — it has no adapter, no webhook and no
    // credential. Listing it here would invite the question of why it has no
    // key, which is a question about a thing that does not exist.
    .filter((provider) => provider !== 'manual')
    .map((provider) => {
      const { label, envVar } = CREDENTIALS[provider];
      const raw = process.env[envVar];
      return {
        provider,
        label,
        registered: registered.has(provider),
        // Trimmed: an env var set to an empty string is not a credential, and
        // it is the most common way a deploy looks configured and is not.
        credentialPresent: typeof raw === 'string' && raw.trim() !== '',
        credentialEnvVar: envVar,
        paymentCount: counts.get(provider) ?? 0,
      };
    });
});
