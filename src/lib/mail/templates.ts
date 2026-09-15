import 'server-only';

import type { InvoiceDetail } from '@/lib/queries/invoices';
import type { Settings } from '@/lib/queries/settings';
import { currencySymbol, formatDateFull, formatMinorDigits } from '@/lib/format';

import { escapeHtml } from './send';

/* ==========================================================================
   Email bodies.
   ==========================================================================

   Plain HTML with a hand-written text alternative, not @react-email/components.

   react-email is the better tool for a marketing team maintaining twenty
   templates. There are four here, they share one layout, and the cost of the
   library is a React render pass plus a dependency tree in the cron path. The
   thing it mainly buys — tables-and-inline-styles that survive Outlook — is one
   table and a handful of inline styles at this size, written once below.

   What is NOT optional is the text alternative. HTML-only mail scores badly
   with spam filters and renders as an empty message in a text-only client, so
   every template returns both and `sendMail` refuses neither.

   ## Palette

   The same print palette the PDF uses: light tokens measured against white,
   because an email is read on a white card in a mail client, not on the app's
   ink ground. Inline, because mail clients strip <style>.
   ========================================================================== */

const INK = {
  primary: '#192029',
  secondary: '#4c535d',
  muted: '#6b727a',
  accent: '#9a541b',
  line: '#d3d1cb',
  inset: '#f9f8f5',
  paid: '#07553f',
  overdue: '#846500',
} as const;

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

export type EmailBody = { subject: string; html: string; text: string };

const money = (minor: bigint, currency: string) =>
  `${currencySymbol(currency)}${formatMinorDigits(minor, currency)}`;

/**
 * `payments.method` holds whatever its source called it, and the two sources
 * disagree: the manual form composes "Bank transfer — first instalment", while
 * a gateway reports `bank_transfer`, `card`, `mobile_money`, `ussd`.
 *
 * On the app's own screens the raw token is fine — it is a record, read by the
 * person who owns the ledger. On a receipt it is addressed to a client, and
 * `bank_transfer` reads as a database leaking into a letter.
 *
 * Only touches strings that look machine-made. Anything already carrying a
 * space or a capital came from a human and is left exactly as typed, so the
 * manual form's note survives intact.
 */
function humaniseMethod(method: string): string {
  const trimmed = method.trim();
  if (trimmed === '') return trimmed;
  if (/[A-Z\s]/.test(trimmed)) return trimmed;

  const words = trimmed.split('_').filter((w) => w !== '');
  if (words.length === 0) return trimmed;

  // USSD and POS are initialisms, not words to title-case.
  const INITIALISMS = new Set(['ussd', 'pos', 'nfc', 'qr']);
  return words
    .map((word, index) => {
      if (INITIALISMS.has(word)) return word.toUpperCase();
      return index === 0 ? word[0]!.toUpperCase() + word.slice(1) : word;
    })
    .join(' ');
}

/** The business block that closes every message, from the settings row. */
function signatureHtml(settings: Settings): string {
  const lines = [
    ...settings.businessAddress.split(/\r?\n/),
    settings.businessEmail,
    settings.businessPhone,
  ]
    .map((l) => l.trim())
    .filter((l) => l !== '');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:32px;border-top:1px solid ${INK.line}">
      <tr><td style="padding-top:16px;font-family:${SANS};font-size:12px;line-height:1.6;color:${INK.muted}">
        <strong style="color:${INK.primary}">${escapeHtml(settings.businessName)}</strong><br>
        ${lines.map((l) => escapeHtml(l)).join('<br>')}
      </td></tr>
    </table>`;
}

function signatureText(settings: Settings): string {
  const lines = [
    ...settings.businessAddress.split(/\r?\n/),
    settings.businessEmail,
    settings.businessPhone,
  ]
    .map((l) => l.trim())
    .filter((l) => l !== '');

  return ['', '—', settings.businessName, ...lines].join('\n');
}

/** One shell so the four templates cannot drift apart visually. */
function layout(inner: string, settings: Settings): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${INK.inset}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${INK.inset}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:560px;background:#ffffff;border:1px solid ${INK.line};border-radius:6px">
        <tr><td style="padding:28px 28px 32px 28px;font-family:${SANS};font-size:14px;line-height:1.6;color:${INK.primary}">
          <div style="font-family:${SANS};font-size:17px;font-weight:600;color:${INK.accent};margin-bottom:20px">${escapeHtml(settings.businessName)}</div>
          ${inner}
          ${signatureHtml(settings)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** A label/value row, used for the money facts. */
function factRow(label: string, value: string, emphasis = false): string {
  return `
    <tr>
      <td style="padding:6px 0;font-family:${SANS};font-size:13px;color:${INK.secondary}">${escapeHtml(label)}</td>
      <td align="right" style="padding:6px 0;font-family:${MONO};font-size:${emphasis ? '15px' : '13px'};${emphasis ? `font-weight:600;color:${INK.primary}` : `color:${INK.primary}`}">${escapeHtml(value)}</td>
    </tr>`;
}

/* -------------------------------------------------------------------------- */
/* Receipt                                                                    */
/* -------------------------------------------------------------------------- */

export function receiptEmail({
  invoice,
  settings,
  amountMinor,
  paidOn,
  method,
}: {
  invoice: InvoiceDetail;
  settings: Settings;
  amountMinor: bigint;
  paidOn: Date;
  method: string | null;
}): EmailBody {
  const received = invoice.payments
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + p.amountMinor, 0n);
  const balance = invoice.amountMinor - received;
  const settled = balance <= 0n;

  const subject = `Payment received — ${money(amountMinor, invoice.currency)} for ${invoice.number}`;

  const facts = [
    factRow('Invoice', invoice.number),
    factRow('Payment received', money(amountMinor, invoice.currency), true),
    method ? factRow('Method', humaniseMethod(method)) : '',
    factRow('Date', formatDateFull(paidOn)),
    factRow('Invoice total', money(invoice.amountMinor, invoice.currency)),
    settled
      ? ''
      : factRow('Balance remaining', money(balance, invoice.currency), true),
  ].join('');

  const inner = `
    <p style="margin:0 0 16px 0">Hello ${escapeHtml(invoice.client.name)},</p>
    <p style="margin:0 0 20px 0">Thank you — we have received your payment of
      <strong>${escapeHtml(money(amountMinor, invoice.currency))}</strong> against invoice
      <strong>${escapeHtml(invoice.number)}</strong>.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${INK.line};border-bottom:1px solid ${INK.line};margin:0 0 20px 0">
      ${facts}
    </table>

    ${
      settled
        ? `<p style="margin:0 0 8px 0;color:${INK.paid};font-weight:600">This invoice is now settled in full. Nothing further is due.</p>`
        : `<p style="margin:0 0 8px 0">That leaves <strong>${escapeHtml(money(balance, invoice.currency))}</strong> outstanding on this invoice.</p>`
    }
    <p style="margin:0;color:${INK.secondary};font-size:13px">A copy of the invoice is attached for your records.</p>`;

  const text = [
    `Hello ${invoice.client.name},`,
    '',
    `Thank you — we have received your payment of ${money(amountMinor, invoice.currency)} against invoice ${invoice.number}.`,
    '',
    `Invoice:           ${invoice.number}`,
    `Payment received:  ${money(amountMinor, invoice.currency)}`,
    ...(method ? [`Method:            ${humaniseMethod(method)}`] : []),
    `Date:              ${formatDateFull(paidOn)}`,
    `Invoice total:     ${money(invoice.amountMinor, invoice.currency)}`,
    ...(settled ? [] : [`Balance remaining: ${money(balance, invoice.currency)}`]),
    '',
    settled
      ? 'This invoice is now settled in full. Nothing further is due.'
      : `That leaves ${money(balance, invoice.currency)} outstanding on this invoice.`,
    '',
    'A copy of the invoice is attached for your records.',
    signatureText(settings),
  ].join('\n');

  return { subject, html: layout(inner, settings), text };
}

/* -------------------------------------------------------------------------- */
/* Reminders                                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Three tones, and the escalation is the whole point.
 *
 * Read together they should sound like one person writing three times, growing
 * firmer — not three templates with the adjectives swapped. What changes across
 * them:
 *
 *   1. ASSUMES AN OVERSIGHT. The invoice may simply have been missed, and it
 *      says so. It apologises for the nudge if payment is already in flight,
 *      because at three days that is genuinely likely. No consequence is named
 *      because none is warranted yet.
 *
 *   2. DROPS THE APOLOGY, ADDS A QUESTION. It stops assuming and starts asking:
 *      is something blocking this? That is the honest middle — most invoices
 *      that reach a fortnight late are stuck on something a conversation would
 *      fix, and asking is both kinder and more effective than repeating.
 *
 *   3. STATES A POSITION. It says the account needs settling and that work may
 *      pause until it is. It still offers a conversation and it never threatens
 *      — no lawyers, no collections, no late fees invented on the spot. The
 *      firmness comes from plainness and from naming the elapsed time, not from
 *      menace. A supplier who wants to be paid usually also wants to keep the
 *      client.
 *
 * Every one of them states the amount, the invoice number and the days overdue,
 * and attaches the invoice, because the most common honest reason for non-
 * payment is that nobody can find the document.
 */

export const REMINDER_SEQUENCES = [1, 2, 3] as const;
export type ReminderSequence = (typeof REMINDER_SEQUENCES)[number];

export function reminderEmail({
  invoice,
  settings,
  sequence,
  daysOverdue,
}: {
  invoice: InvoiceDetail;
  settings: Settings;
  sequence: ReminderSequence;
  daysOverdue: number;
}): EmailBody {
  const outstanding = invoice.outstandingMinor;
  const amount = money(outstanding, invoice.currency);
  const days = `${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'}`;
  const due = invoice.dueAt ? formatDateFull(invoice.dueAt) : null;
  const partPaid = invoice.paidMinor > 0n;

  const subject =
    sequence === 1
      ? `${invoice.number} — ${amount} was due${due ? ` on ${due}` : ''}`
      : sequence === 2
        ? `Still outstanding: ${invoice.number}, ${amount}`
        : `${invoice.number} — ${amount} now ${days} overdue`;

  const opening =
    sequence === 1
      ? `<p style="margin:0 0 16px 0">Hello ${escapeHtml(invoice.client.name)},</p>
         <p style="margin:0 0 16px 0">A quick note that invoice <strong>${escapeHtml(invoice.number)}</strong>
         for <strong>${escapeHtml(amount)}</strong>${due ? ` fell due on ${escapeHtml(due)}` : ' is now due'},
         which is ${escapeHtml(days)} ago. It may simply have been missed.</p>
         <p style="margin:0 0 20px 0">If it is already on its way, please ignore this — and apologies for the nudge.</p>`
      : sequence === 2
        ? `<p style="margin:0 0 16px 0">Hello ${escapeHtml(invoice.client.name)},</p>
           <p style="margin:0 0 16px 0">Invoice <strong>${escapeHtml(invoice.number)}</strong> for
           <strong>${escapeHtml(amount)}</strong> is still unpaid, ${escapeHtml(days)} after it was due.</p>
           <p style="margin:0 0 20px 0">Is something holding it up? If there is a PO number missing, an approval
           waiting, or a problem with the invoice itself, tell me and I will sort it out. If it is simply
           outstanding, a payment date would help.</p>`
        : `<p style="margin:0 0 16px 0">Hello ${escapeHtml(invoice.client.name)},</p>
           <p style="margin:0 0 16px 0">Invoice <strong>${escapeHtml(invoice.number)}</strong> for
           <strong>${escapeHtml(amount)}</strong> is now <strong>${escapeHtml(days)}</strong> overdue, and I have
           written twice before about it.</p>
           <p style="margin:0 0 20px 0">I do need this settled. Until it is, I am holding further work on
           your account. I would much rather resolve it than leave it sitting here — if you can tell me
           when it will be paid, or what is preventing it, we can deal with it today.</p>`;

  const facts = [
    factRow('Invoice', invoice.number),
    factRow('Amount outstanding', amount, true),
    due ? factRow('Due', due) : '',
    factRow('Overdue by', days),
    partPaid
      ? factRow('Already received', money(invoice.paidMinor, invoice.currency))
      : '',
  ].join('');

  const inner = `
    ${opening}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid ${INK.line};border-bottom:1px solid ${INK.line};margin:0 0 20px 0">
      ${facts}
    </table>
    ${
      partPaid
        ? `<p style="margin:0 0 12px 0;font-size:13px;color:${INK.secondary}">This accounts for the
           ${escapeHtml(money(invoice.paidMinor, invoice.currency))} already received against this invoice.</p>`
        : ''
    }
    <p style="margin:0;color:${INK.secondary};font-size:13px">The invoice is attached again here, in case the
    original is not to hand.</p>`;

  const text = [
    `Hello ${invoice.client.name},`,
    '',
    sequence === 1
      ? `A quick note that invoice ${invoice.number} for ${amount}${due ? ` fell due on ${due}` : ' is now due'}, which is ${days} ago. It may simply have been missed.\n\nIf it is already on its way, please ignore this — and apologies for the nudge.`
      : sequence === 2
        ? `Invoice ${invoice.number} for ${amount} is still unpaid, ${days} after it was due.\n\nIs something holding it up? If there is a PO number missing, an approval waiting, or a problem with the invoice itself, tell me and I will sort it out. If it is simply outstanding, a payment date would help.`
        : `Invoice ${invoice.number} for ${amount} is now ${days} overdue, and I have written twice before about it.\n\nI do need this settled. Until it is, I am holding further work on your account. I would much rather resolve it than leave it sitting here — if you can tell me when it will be paid, or what is preventing it, we can deal with it today.`,
    '',
    `Invoice:            ${invoice.number}`,
    `Amount outstanding: ${amount}`,
    ...(due ? [`Due:                ${due}`] : []),
    `Overdue by:         ${days}`,
    ...(partPaid ? [`Already received:   ${money(invoice.paidMinor, invoice.currency)}`] : []),
    '',
    'The invoice is attached again here, in case the original is not to hand.',
    signatureText(settings),
  ].join('\n');

  return { subject, html: layout(inner, settings), text };
}
