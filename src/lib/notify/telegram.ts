import 'server-only';

import type { Settings } from '@/lib/queries/settings';
import type { TelegramAlertKind } from '@/lib/db';

/* ==========================================================================
   Telegram alerts — the send layer.
   ==========================================================================

   A phone notification, not a report. Three or four short lines that answer
   "what happened, to whom, how much" from the lock screen, so the common case
   needs no app to be opened at all.

   ## The split between env and settings

   The bot token is an environment variable and nothing else. It is a
   credential: it can send as the bot to ANY chat the bot can reach, so it
   belongs where the gateway keys live and never in a row an admin form can
   read back. The chat id is the opposite — a destination, not a secret,
   changed by whoever is on call — so it lives in settings with the toggles.

   Same reasoning as the gateway panel: this module reports whether the token is
   present, never what it is.

   ## Silence is a valid outcome

   No token, no chat id, or the event's toggle off — all return `skipped`, and
   nothing upstream treats that as an error. Settings validation already refuses
   "alerts on with no destination", so a missing chat id here means alerts were
   deliberately never set up, and a cron that logged a failure every minute for
   a feature nobody enabled would be noise that trains you to ignore the log.

   ## Escaping

   Telegram's HTML mode parses a real, if tiny, markup language. A client named
   `Mendel <& Sons>` would at best break the parse and get the whole message
   rejected with a 400; at worst an interpolated `<b>` or `<a href>` would let
   whatever named a client or an error decide how the message reads. So every
   interpolated value goes through `escape`, and the ONLY markup this module
   emits is the `<b>` it writes itself, around the amount.
   ========================================================================== */

const API_BASE = 'https://api.telegram.org';

/** How long to wait on Telegram before giving up and recording a failure. */
const TIMEOUT_MS = 10_000;

export type TelegramOutcome =
  | { status: 'sent'; messageId: string; chatId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

/** Present or absent. Never the token — see the gateway panel for why. */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

/**
 * The four characters Telegram's HTML parser treats as markup.
 *
 * `&` MUST be replaced first: doing it after `<` would turn the `&lt;` this
 * function just produced into `&amp;lt;`, and the message would show the escape
 * rather than the character.
 */
export function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* -------------------------------------------------------------------------- */
/* Which events are allowed to fire                                           */
/* -------------------------------------------------------------------------- */

/**
 * Whether this kind of alert may be sent at all.
 *
 * ## Processing failures ignore the two toggles, deliberately
 *
 * `alertOnPaymentSuccess` and `alertOnPaymentFailure` are both named for
 * business events — things that happened to a client's money, which an owner
 * may reasonably not want to hear about at 3am. A dead-lettered event is not
 * that. It means the pipeline gave up after five attempts and money may have
 * moved with nothing in the database to show for it, and there is no state of
 * the business in which the right response is silence.
 *
 * It is still gated on a chat id, because that is not a preference — with no
 * destination there is nowhere to send.
 *
 * The honest cost: someone who turns both toggles off can still be buzzed.
 * That is intended, and it stays rare by construction — reaching dead-letter
 * takes five failures across a backoff ladder that ends at ten hours, so this
 * fires when something is genuinely, persistently broken.
 */
export function alertAllowed(
  kind: TelegramAlertKind,
  settings: Settings,
): { allowed: true; chatId: string } | { allowed: false; reason: string } {
  if (!telegramConfigured()) {
    return { allowed: false, reason: 'TELEGRAM_BOT_TOKEN is not set' };
  }

  const chatId = settings.telegramChatId.trim();
  if (!chatId) return { allowed: false, reason: 'no chat id configured' };

  if (kind === 'payment_succeeded' && !settings.alertOnPaymentSuccess) {
    return { allowed: false, reason: 'payment-success alerts are off' };
  }
  if (kind === 'payment_failed' && !settings.alertOnPaymentFailure) {
    return { allowed: false, reason: 'payment-failure alerts are off' };
  }

  return { allowed: true, chatId };
}

/* -------------------------------------------------------------------------- */
/* The send                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Posts one message. Never throws — a failure is a value, as with `sendMail`.
 *
 * `disable_web_page_preview` because an invoice number or an error string can
 * look enough like a link that Telegram expands a preview card under it, which
 * turns a three-line notification into a screenful.
 */
export async function sendTelegramMessage(
  chatId: string,
  html: string,
): Promise<TelegramOutcome> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { status: 'skipped', reason: 'TELEGRAM_BOT_TOKEN is not set' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    } | null;

    if (!response.ok || !body?.ok) {
      /*
       * Telegram's own `description` is the useful half — "chat not found",
       * "can't parse entities". The status code alone would send someone
       * looking in the wrong place.
       */
      const detail = body?.description ?? `HTTP ${response.status}`;
      return { status: 'failed', error: detail };
    }

    return {
      status: 'sent',
      messageId: String(body.result?.message_id ?? ''),
      chatId,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Telegram did not respond within ${TIMEOUT_MS / 1000}s`
        : error instanceof Error
          ? error.message
          : String(error);
    return { status: 'failed', error: message };
  } finally {
    clearTimeout(timer);
  }
}
