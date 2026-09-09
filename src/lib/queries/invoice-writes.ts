import 'server-only';

import { sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';

/* ==========================================================================
   Writing invoices.
   ==========================================================================

   ## The transaction question, answered by measurement

   `invoice_line_items` carries a DEFERRABLE INITIALLY DEFERRED constraint
   trigger: if an invoice has any line items, they must sum to its
   `amount_minor`. Deferred means "checked at COMMIT" — and neon-http gives
   every statement its own implicit transaction, so a statement that changes
   only one side of that equation is rejected on its own.

   Verified against the live database and the live trigger:

     bare INSERT adding a 2nd line to a balanced invoice   REJECTED
     CREATE  invoice + 3 lines in one CTE                  OK
     UPDATE  grow 3 -> 4 with positions reused             OK
     UPDATE  shrink 4 -> 2                                 OK
     total deliberately set to disagree with its lines     REJECTED

   So: **no pooled connection, no `drizzle-orm/neon-serverless`, no WebSocket
   dependency.** A data-modifying CTE is one statement, therefore one implicit
   transaction, therefore one deferred check that sees the final state. The
   trigger is satisfied rather than bypassed — the last line above is the proof;
   a wrong total is still refused.

   The cost is that these are long SQL statements rather than a sequence of
   Drizzle calls, which is why each is commented. If a future write needs more
   than one statement to be atomic — say, recording a payment and closing an
   invoice together — that is the point to add `Pool` from
   `@neondatabase/serverless` with `drizzle-orm/neon-serverless` and a real
   `db.transaction()`. It is a connection change, not a rewrite, and it is not
   needed for anything here.

   ## Why positions are upserted rather than deleted and re-inserted

   The obvious update is "delete every line, insert the new set". Inside one
   statement all the CTE parts share a snapshot, so a DELETE of position 1 and
   an INSERT of position 1 are not ordered with respect to each other and the
   unique `(invoice_id, position)` index is entitled to see both. Upserting on
   that same key sidesteps the question entirely: positions 1..n are written in
   place, and anything beyond n is deleted. Both of the shapes that matters —
   growing and shrinking the line count — are in the measurements above.
   ========================================================================== */

export type LineItemInput = {
  position: number;
  description: string;
  /** Canonical numeric(12,3), from `parseQuantity`. */
  quantity: string;
  unitAmountMinor: bigint;
  lineAmountMinor: bigint;
};

export type InvoiceWriteInput = {
  clientId: string;
  currency: string;
  description: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  lineItems: LineItemInput[];
};

/**
 * The line rows as a VALUES list.
 *
 * bigints are bound as text and cast, because the driver serialises a JS
 * bigint through JSON otherwise and a large kobo figure would not survive it.
 */
function lineValues(lines: LineItemInput[]): SQL {
  return sql.join(
    lines.map(
      (l) => sql`(
        ${l.position}::int,
        ${l.description}::text,
        ${l.quantity}::text,
        ${String(l.unitAmountMinor)}::text,
        ${String(l.lineAmountMinor)}::text
      )`,
    ),
    sql`, `,
  );
}

const totalOf = (lines: LineItemInput[]) =>
  lines.reduce((sum, l) => sum + l.lineAmountMinor, 0n);

export type CreatedInvoice = { id: string; number: string };

/**
 * Creates a draft invoice with its lines, in one statement.
 *
 * Numbering is scoped to real invoices — `is_demo = false` and an `INV-`
 * prefix. Demo invoices live in their own `DEMO-2026-####` space, so the two
 * sequences can both start at 1 and never meet however far either grows.
 *
 * The number is generated inside the same statement rather than read first and
 * written second, so two admins creating at the same moment cannot both read
 * the same maximum. The window is not zero — two concurrent
 * statements can still both see the pre-insert maximum — but the unique
 * constraint on `number` is the backstop, and the caller turns that into a
 * retry rather than a lost invoice.
 */
export async function insertInvoice(
  input: InvoiceWriteInput,
  year: number,
): Promise<CreatedInvoice> {
  const total = totalOf(input.lineItems);

  const result = await db.execute(sql`
    with next_number as (
      select
        'INV-' || ${year}::text || '-' ||
        lpad(
          (coalesce(max((regexp_match(number, '^INV-\\d{4}-(\\d+)$'))[1]::int), 0) + 1)::text,
          4, '0'
        ) as number
      from invoices
      -- Real invoices only, on both counts. The demo set numbers from
      -- DEMO-2026-0001, so the prefix already excludes it; is_demo = false
      -- says so explicitly rather than resting on a naming convention holding.
      -- A demo row that somehow carried an INV- number would otherwise push
      -- real numbering past it permanently.
      where is_demo = false
        and number ~ ('^INV-' || ${year}::text || '-\\d+$')
    ),
    created as (
      insert into invoices
        (number, client_id, amount_minor, currency, status, description, issued_at, due_at, is_demo)
      select
        n.number, ${input.clientId}::uuid, ${String(total)}::bigint, ${input.currency},
        'draft', ${input.description}, ${input.issuedAt}, ${input.dueAt}, false
      from next_number n
      returning id, number
    ),
    -- Data-modifying CTEs always run to completion whether or not the primary
    -- query reads them, so this is not dead code.
    lines as (
      insert into invoice_line_items
        (invoice_id, position, description, quantity, unit_amount_minor, line_amount_minor)
      select c.id, v.position, v.description, v.quantity::numeric,
             v.unit::bigint, v.line::bigint
      from created c, (values ${lineValues(input.lineItems)})
        as v(position, description, quantity, unit, line)
      returning 1
    )
    select id::text as id, number from created
  `);

  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error('invoice insert returned no row');
  return { id: String(row.id), number: String(row.number) };
}

/**
 * Rewrites a draft invoice and its lines, in one statement.
 *
 * `status = 'draft'` is in the WHERE clause, not checked beforehand: the guard
 * has to be part of the write, or an invoice sent between the check and the
 * update would be silently rewritten — which is the exact failure this rule
 * exists to prevent. Zero rows back means the guard refused, and the caller
 * reads the invoice to say why.
 */
export async function updateDraftInvoice(
  id: string,
  input: InvoiceWriteInput,
): Promise<boolean> {
  const total = totalOf(input.lineItems);

  const result = await db.execute(sql`
    with target as (
      select id from invoices where id = ${id}::uuid and status = 'draft'
    ),
    retotalled as (
      update invoices set
        client_id   = ${input.clientId}::uuid,
        currency    = ${input.currency},
        description = ${input.description},
        issued_at   = ${input.issuedAt},
        due_at      = ${input.dueAt},
        amount_minor = ${String(total)}::bigint,
        updated_at  = now()
      where id in (select id from target)
      returning id
    ),
    upserted as (
      insert into invoice_line_items
        (invoice_id, position, description, quantity, unit_amount_minor, line_amount_minor)
      select t.id, v.position, v.description, v.quantity::numeric,
             v.unit::bigint, v.line::bigint
      from target t, (values ${lineValues(input.lineItems)})
        as v(position, description, quantity, unit, line)
      on conflict (invoice_id, position) do update set
        description       = excluded.description,
        quantity          = excluded.quantity,
        unit_amount_minor = excluded.unit_amount_minor,
        line_amount_minor = excluded.line_amount_minor,
        updated_at        = now()
      returning position
    ),
    trimmed as (
      delete from invoice_line_items
      where invoice_id in (select id from target)
        and position > ${input.lineItems.length}
      returning 1
    )
    select id::text as id from retotalled
  `);

  return result.rows.length > 0;
}

export type VoidRefusal = 'not-found' | 'has-payments' | 'already-void' | 'wrong-status';

/**
 * Voids an invoice. Guarded in SQL, explained by a follow-up read.
 *
 * The `not exists` is what makes this safe: an invoice with money against it is
 * not a status problem, and the guard has to sit in the write rather than in a
 * check before it. The second query runs only when the first refused, and only
 * to produce a message — the update is the authority.
 */
export async function voidInvoiceRow(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: VoidRefusal; paymentCount?: number }> {
  const done = await db.execute(sql`
    update invoices set status = 'void', updated_at = now()
    where id = ${id}::uuid
      and status in ('draft', 'sent')
      and not exists (select 1 from payments p where p.invoice_id = invoices.id)
    returning id
  `);
  if (done.rows.length > 0) return { ok: true };

  const [state] = (
    await db.execute(sql`
      select i.status,
             (select count(*)::int from payments p where p.invoice_id = i.id) as payments
      from invoices i where i.id = ${id}::uuid
    `)
  ).rows as Record<string, unknown>[];

  if (!state) return { ok: false, reason: 'not-found' };
  const payments = Number(state.payments ?? 0);
  if (payments > 0) return { ok: false, reason: 'has-payments', paymentCount: payments };
  if (state.status === 'void') return { ok: false, reason: 'already-void' };
  return { ok: false, reason: 'wrong-status' };
}

export type SendRefusal = 'not-found' | 'not-draft' | 'no-line-items';

/**
 * draft -> sent. The transition that makes an invoice uneditable.
 *
 * `issued_at` is filled here if the draft never carried one: an invoice that
 * has been sent has been issued, and leaving it null would put a dash where the
 * ledger expects a date.
 */
export async function markInvoiceSentRow(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: SendRefusal }> {
  const done = await db.execute(sql`
    update invoices set
      status     = 'sent',
      sent_at    = coalesce(sent_at, now()),
      issued_at  = coalesce(issued_at, now()),
      updated_at = now()
    where id = ${id}::uuid
      and status = 'draft'
      and exists (select 1 from invoice_line_items l where l.invoice_id = invoices.id)
    returning id
  `);
  if (done.rows.length > 0) return { ok: true };

  const [state] = (
    await db.execute(sql`
      select i.status,
             (select count(*)::int from invoice_line_items l where l.invoice_id = i.id) as lines
      from invoices i where i.id = ${id}::uuid
    `)
  ).rows as Record<string, unknown>[];

  if (!state) return { ok: false, reason: 'not-found' };
  if (state.status !== 'draft') return { ok: false, reason: 'not-draft' };
  return { ok: false, reason: 'no-line-items' };
}

/** Clients the form can pick from, and whether an invoice is still a draft. */
export async function getInvoiceStatusFor(id: string): Promise<string | null> {
  const [row] = (
    await db.execute(sql`select status from invoices where id = ${id}::uuid`)
  ).rows as Record<string, unknown>[];
  return row ? String(row.status) : null;
}
