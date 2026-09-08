import { createHash } from 'node:crypto';

import { getAdapter } from '@/lib/gateways';
import { db, webhookEvents } from '@/lib/db';

/**
 * Webhook intake. Records; does not process.
 *
 * Paystack expects a 200 well inside a ~30s timeout and retries anything else,
 * so this route does the four things that must happen synchronously and
 * nothing more: read the raw body, verify it, record it, acknowledge it. No
 * client lookup, no invoice matching, no email. Those happen in the drain,
 * which reads `webhook_events` on its own schedule and can be slow, fail and
 * retry without a provider watching the clock.
 *
 * The route is deliberately dull. Every second of work added here is a second
 * closer to a timeout, and a timeout means the same event arrives again.
 */

/** Beyond this we record a truncated marker rather than the body. */
const MAX_STORED_BODY_BYTES = 256 * 1024;

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  const adapter = getAdapter(provider);
  if (!adapter) {
    // Unknown or unimplemented provider. 404 rather than 200: a sender that
    // gets 200 believes delivery succeeded and stops retrying.
    return jsonResponse(404, { error: 'Unknown provider' });
  }

  /**
   * Raw text, before any parsing. The HMAC is over the exact bytes sent —
   * `JSON.parse` followed by `JSON.stringify` loses key order and whitespace
   * and produces a different digest, so parsing first would fail every
   * signature. This is the single most common way a webhook integration
   * breaks.
   */
  const rawBody = await request.text();

  const signatureOk = adapter.verify(rawBody, request.headers);

  if (!signatureOk) {
    /**
     * Record for the audit trail, then reject. Two details matter here.
     *
     * The event id is namespaced `unverified:<sha256 of body>` and NOT derived
     * the way a real event's id is. If unverified events shared the real key
     * space, anyone could POST an unsigned payload carrying the id of an event
     * they knew was coming; our own `onConflictDoNothing` would then discard
     * the genuine signed event when it arrived. Cheap denial of processing.
     * Separate namespaces make that impossible.
     *
     * The payload is stored without being trusted — never parsed for meaning,
     * never normalised, never processed. The drain only ever selects rows with
     * `signature_ok = true`.
     */
    const digest = createHash('sha256').update(rawBody, 'utf8').digest('hex');

    await db
      .insert(webhookEvents)
      .values({
        provider: adapter.id,
        providerEventId: `unverified:${digest}`,
        payload: safePayload(rawBody),
        signatureOk: false,
      })
      .onConflictDoNothing();

    return jsonResponse(401, { error: 'Invalid signature' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed by us but not JSON. Record it; do not retry-loop the sender over
    // something only we can fix.
    const digest = createHash('sha256').update(rawBody, 'utf8').digest('hex');
    await db
      .insert(webhookEvents)
      .values({
        provider: adapter.id,
        providerEventId: `unparseable:${digest}`,
        payload: safePayload(rawBody),
        signatureOk: true,
      })
      .onConflictDoNothing();

    return jsonResponse(200, { received: true, note: 'unparseable body' });
  }

  const providerEventId = adapter.extractEventId(payload, rawBody);

  /**
   * `onConflictDoNothing` on `(provider, provider_event_id)` is the whole
   * deduplication story. A retry inserts nothing and still gets a 200 —
   * returning an error on a duplicate would keep the sender retrying an event
   * we already hold, forever.
   */
  await db
    .insert(webhookEvents)
    .values({
      provider: adapter.id,
      providerEventId,
      payload: payload as Record<string, unknown>,
      signatureOk: true,
    })
    .onConflictDoNothing();

  return jsonResponse(200, { received: true });
}

/** jsonb is NOT NULL, so a non-JSON body still needs something storable. */
function safePayload(rawBody: string): Record<string, unknown> {
  const oversized = Buffer.byteLength(rawBody, 'utf8') > MAX_STORED_BODY_BYTES;
  const body = oversized ? rawBody.slice(0, 2000) : rawBody;

  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { unparseable: true, truncated: oversized, body };
  }
}

/**
 * A webhook endpoint that answers GET tells a scanner it exists and tells a
 * misconfigured dashboard nothing useful. 405 is the honest answer.
 */
export async function GET() {
  return jsonResponse(405, { error: 'Method not allowed' });
}
