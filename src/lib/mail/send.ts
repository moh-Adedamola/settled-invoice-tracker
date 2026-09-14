import 'server-only';

import { Resend } from 'resend';

/* ==========================================================================
   The send layer.
   ==========================================================================

   Everything outbound goes through `sendMail`. It owns three things nothing
   above it should have to think about: the demo redirect, the plain-text
   alternative, and turning a provider failure into a value rather than a throw.

   ## The demo redirect

   Resend's test domain (`onboarding@resend.dev`) only delivers to the account's
   own address. Sending a receipt "to" a client therefore either bounces or —
   worse — silently goes nowhere, and the first time anyone notices is when a
   client says they never got it.

   So when `DEMO_EMAIL_REDIRECT` is set, the message is addressed there instead,
   and it is made LOUD about what happened:

     - the subject is prefixed `[DEMO → real@recipient]`
     - the HTML body opens with a full-width amber banner naming the intended
       recipient and saying in as many words that the client did not receive it
     - the text alternative opens with the same statement in a box rule

   The banner exists for the forwarding case. A demo receipt that looks exactly
   like a real one is a document someone will forward to a client, or paste into
   a deck, believing it was delivered. Making it impossible to mistake is worth
   more than making it pretty.

   When the variable is absent, none of that applies and the message goes to the
   real recipient. THE CODE PATH IS OTHERWISE IDENTICAL — same template, same
   attachment, same logging — so testing through the redirect exercises the
   production path rather than a parallel one.

   ## Failures are values

   `sendMail` never throws for a provider error. A cron run that dies partway
   through leaves some invoices reminded and some not, with nothing recorded
   about which; returning a result lets the caller log the failure against the
   row and carry on to the next one.
   ========================================================================== */

export type Attachment = {
  filename: string;
  content: Buffer;
};

export type SendInput = {
  /** The INTENDED recipient. The redirect is applied here, not by the caller. */
  to: string;
  subject: string;
  html: string;
  /** Required, not optional — see `assertText` below. */
  text: string;
  attachments?: Attachment[];
};

export type SendResult =
  | { ok: true; providerMessageId: string; deliveredTo: string; redirected: boolean }
  | { ok: false; error: string; deliveredTo: string | null; redirected: boolean };

/** Where a demo send actually goes, or null when this is a real environment. */
export function demoRedirect(): string | null {
  const value = process.env.DEMO_EMAIL_REDIRECT?.trim();
  return value ? value : null;
}

const BANNER_BG = '#fbefd0';
const BANNER_FG = '#846500';
const BANNER_LINE = '#d3b675';

/**
 * The banner, in the `overdue` tokens from §3.2 — the one status palette that
 * means "this needs your attention" without meaning "something failed".
 *
 * Inline styles because every mail client strips `<style>` blocks, and a banner
 * that loses its styling is exactly the one that must not.
 */
function demoBanner(intended: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px 0">
      <tr>
        <td style="background:${BANNER_BG};border:1px solid ${BANNER_LINE};border-left:4px solid ${BANNER_FG};padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BANNER_FG}">
          <strong style="display:block;font-size:14px;margin-bottom:4px">DEMO — THIS WAS NOT SENT TO THE CLIENT</strong>
          It was addressed to <strong>${escapeHtml(intended)}</strong> and redirected to this inbox
          because Settled is running against a test mail domain. The client has received nothing.
          Do not forward this as proof of delivery.
        </td>
      </tr>
    </table>`.trim();
}

function demoTextBanner(intended: string): string {
  const rule = '='.repeat(64);
  return [
    rule,
    'DEMO — THIS WAS NOT SENT TO THE CLIENT',
    `Addressed to: ${intended}`,
    'Redirected to this inbox because Settled is running against a test mail',
    'domain. The client has received nothing. Do not forward this as proof of',
    'delivery.',
    rule,
    '',
    '',
  ].join('\n');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let client: Resend | null = null;

function resend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  client ??= new Resend(key);
  return client;
}

/**
 * Sends one message.
 *
 * A missing API key or FROM address is a configuration failure, returned as one
 * rather than thrown: the cron route logs it against every row it tried and
 * reports a count, which is more useful than a 500 with one stack trace.
 */
export async function sendMail(input: SendInput): Promise<SendResult> {
  const redirect = demoRedirect();
  const deliveredTo = redirect ?? input.to;
  const redirected = redirect !== null;

  const api = resend();
  if (!api) {
    return { ok: false, error: 'RESEND_API_KEY is not set.', deliveredTo: null, redirected };
  }

  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    return { ok: false, error: 'RESEND_FROM is not set.', deliveredTo: null, redirected };
  }

  // The intended recipient is in the subject as well as the banner: a mailbox
  // list shows subjects, not bodies, and twenty demo receipts that differ only
  // inside the body are twenty identical-looking rows.
  const subject = redirected ? `[DEMO → ${input.to}] ${input.subject}` : input.subject;
  const html = redirected ? `${demoBanner(input.to)}\n${input.html}` : input.html;
  const text = redirected ? `${demoTextBanner(input.to)}${input.text}` : input.text;

  try {
    const { data, error } = await api.emails.send({
      from,
      to: [deliveredTo],
      subject,
      html,
      // Every message carries a plain-text alternative. HTML-only mail scores
      // badly with spam filters and renders as nothing in a text-only client.
      text,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      return { ok: false, error: `${error.name}: ${error.message}`, deliveredTo, redirected };
    }
    if (!data?.id) {
      return { ok: false, error: 'Resend accepted the message but returned no id.', deliveredTo, redirected };
    }

    return { ok: true, providerMessageId: data.id, deliveredTo, redirected };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, error: message, deliveredTo, redirected };
  }
}
