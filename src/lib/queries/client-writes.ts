import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';

/* ==========================================================================
   Writing clients.
   ==========================================================================

   Simpler than the invoice writes: no deferred trigger, no child rows to keep
   in step, so each of these is one plain statement. The shape still matches —
   guards live in the WHERE clause rather than in a check before the write, so
   a state change between reading and writing cannot slip past.

   `provider_customer_ids` is never touched here. The event processor owns it:
   it is how a webhook's customer maps to a client, and a hand-typed value would
   silently mis-route real money. It is displayed on the detail page as a fact
   about the record and has no field on the form.
   ========================================================================== */

export type ClientWriteInput = {
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export async function insertClient(input: ClientWriteInput): Promise<{ id: string }> {
  const result = await db.execute(sql`
    insert into clients (name, email, phone, notes, is_demo)
    values (${input.name}, ${input.email}, ${input.phone}, ${input.notes}, false)
    returning id::text as id
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error('client insert returned no row');
  return { id: String(row.id) };
}

/** Returns false when the client does not exist. */
export async function updateClientRow(
  id: string,
  input: ClientWriteInput,
): Promise<boolean> {
  const result = await db.execute(sql`
    update clients set
      name       = ${input.name},
      email      = ${input.email},
      phone      = ${input.phone},
      notes      = ${input.notes},
      updated_at = now()
    where id = ${id}::uuid
    returning id
  `);
  return result.rows.length > 0;
}

export type ArchiveRefusal = 'not-found' | 'already-archived' | 'not-archived';

/**
 * Archiving records WHEN, so the guard is `archived_at is null` rather than a
 * boolean flip. Archiving an already-archived client would otherwise quietly
 * move the date and lose the original one.
 */
export async function archiveClientRow(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: ArchiveRefusal }> {
  const done = await db.execute(sql`
    update clients set archived_at = now(), updated_at = now()
    where id = ${id}::uuid and archived_at is null
    returning id
  `);
  if (done.rows.length > 0) return { ok: true };

  const [state] = (
    await db.execute(sql`select archived_at from clients where id = ${id}::uuid`)
  ).rows as Record<string, unknown>[];
  if (!state) return { ok: false, reason: 'not-found' };
  return { ok: false, reason: 'already-archived' };
}

export async function unarchiveClientRow(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: ArchiveRefusal }> {
  const done = await db.execute(sql`
    update clients set archived_at = null, updated_at = now()
    where id = ${id}::uuid and archived_at is not null
    returning id
  `);
  if (done.rows.length > 0) return { ok: true };

  const [state] = (
    await db.execute(sql`select archived_at from clients where id = ${id}::uuid`)
  ).rows as Record<string, unknown>[];
  if (!state) return { ok: false, reason: 'not-found' };
  return { ok: false, reason: 'not-archived' };
}
