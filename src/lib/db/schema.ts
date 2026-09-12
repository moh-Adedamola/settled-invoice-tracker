import { relations, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/* -------------------------------------------------------------------------- */
/* Enums                                                                      */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum('user_role', ['admin', 'viewer']);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'paid',
  'partial',
  'overdue',
  'void',
]);

export const paymentProviderEnum = pgEnum('payment_provider', [
  'stripe',
  'paystack',
  'flutterwave',
  'manual',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'succeeded',
  'pending',
  'failed',
  'refunded',
]);

export const reminderChannelEnum = pgEnum('reminder_channel', ['email', 'telegram']);

/* -------------------------------------------------------------------------- */
/* users                                                                      */
/* -------------------------------------------------------------------------- */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('viewer'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------------------- */
/* sessions                                                                   */
/* -------------------------------------------------------------------------- */

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    // Drives the expired-session sweep.
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* clients                                                                    */
/* -------------------------------------------------------------------------- */

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    /** Provider name -> that provider's customer id, e.g. { stripe: 'cus_123' }. */
    providerCustomerIds: jsonb('provider_customer_ids')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    notes: text('notes'),
    /**
     * When this client was archived, or null while they are active.
     *
     * A timestamp rather than a boolean because "when" is the part you need
     * later — reconciling a payment that arrived after someone stopped being a
     * client is exactly the moment you want the date, and a boolean has thrown
     * it away.
     *
     * Archiving rather than deleting, because `payments.client_id` and
     * `invoices.client_id` carry no ON DELETE. Adding a cascade would be worse
     * than the FK error it removes: deleting a client would vaporise their
     * payment history, and a ledger that can forget money is not a ledger.
     * An archived client is hidden from pickers and out of the list by default;
     * every record that references them still resolves.
     */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Not unique: real clients share billing inboxes, and demo rows would collide.
    index('clients_email_idx').on(t.email),
    // The list hides archived clients by default, so that predicate is on the
    // hot path. Partial, because the rows it excludes are the rare ones.
    index('clients_active_idx').on(t.name).where(sql`${t.archivedAt} is null`),
  ],
);

/* -------------------------------------------------------------------------- */
/* invoices                                                                   */
/* -------------------------------------------------------------------------- */

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    /** Minor units (cents, kobo). Never numeric, never float. */
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    /** ISO 4217, e.g. 'USD', 'NGN'. */
    currency: text('currency').notNull(),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    description: text('description'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('invoices_client_id_idx').on(t.clientId),
    index('invoices_status_idx').on(t.status),
    // Overdue sweep and reminder scheduling read this.
    index('invoices_due_at_idx').on(t.dueAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* payments                                                                   */
/* -------------------------------------------------------------------------- */

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Nullable: an unmatched payment is a normal state, queued for manual matching. */
    invoiceId: uuid('invoice_id').references(() => invoices.id),
    clientId: uuid('client_id').references(() => clients.id),
    provider: paymentProviderEnum('provider').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    /** Amount converted to the reporting base currency, minor units. */
    baseAmountMinor: bigint('base_amount_minor', { mode: 'bigint' }),
    fxRate: numeric('fx_rate', { precision: 18, scale: 8 }),
    fxAt: timestamp('fx_at', { withTimezone: true }),
    status: paymentStatusEnum('status').notNull(),
    method: text('method'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotency guarantee. A provider payment id is unique only inside its
    // own provider's namespace, so the pair is the natural key. Insert with
    // onConflictDoNothing and a redelivered webhook becomes a no-op.
    unique('payments_provider_payment_id_key').on(t.provider, t.providerPaymentId),
    // Not unique: partial payments and refunds mean many rows per invoice.
    index('payments_invoice_id_idx').on(t.invoiceId),
    index('payments_client_id_idx').on(t.clientId),
    index('payments_occurred_at_idx').on(t.occurredAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* webhookEvents                                                              */
/* -------------------------------------------------------------------------- */

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: paymentProviderEnum('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    payload: jsonb('payload').notNull(),
    signatureOk: boolean('signature_ok').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    processError: text('process_error'),
  },
  (t) => [
    // Providers retry until they get a 200, so the same event id arrives more
    // than once. Dedupe at the door, one layer above payments.
    unique('webhook_events_provider_event_id_key').on(t.provider, t.providerEventId),
    // The queue drain query: unprocessed events, ordered by when they are due.
    index('webhook_events_next_attempt_at_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.processedAt} is null`),
  ],
);

/* -------------------------------------------------------------------------- */
/* reminders                                                                  */
/* -------------------------------------------------------------------------- */

export const reminders = pgTable(
  'reminders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    /** 1, 2 or 3 — which nudge in the escalation ladder this was. */
    sequence: integer('sequence').notNull(),
    channel: reminderChannelEnum('channel').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Double-send guard. Claim the slot with an insert BEFORE dispatching:
    // two concurrent cron runs cannot both win, the loser gets a 23505.
    unique('reminders_invoice_sequence_key').on(t.invoiceId, t.sequence),
  ],
);

/* -------------------------------------------------------------------------- */
/* loginAttempts                                                              */
/* -------------------------------------------------------------------------- */

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Namespaced key, never a bare value: 'ip:102.89.34.7' or
     * 'email:accounts@molekschools.ng'. The prefix keeps the two counters in
     * separate spaces so a crafted email can never collide with an IP counter.
     */
    identifier: text('identifier').notNull(),
    attemptedAt: timestamp('attempted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The rate check is always "this identifier, within the window", so the
    // composite in this order is what actually serves it — a standalone
    // identifier index would still scan every historical attempt for that key.
    index('login_attempts_identifier_attempted_at_idx').on(
      t.identifier,
      t.attemptedAt,
    ),
    // Serves the purge sweep, which filters on time alone.
    index('login_attempts_attempted_at_idx').on(t.attemptedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* invoiceLineItems                                                           */
/* -------------------------------------------------------------------------- */

export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    /** Display order. Insertion order is not guaranteed by anything. */
    position: integer('position').notNull(),
    description: text('description').notNull(),
    /** numeric(12,3): supports partial units such as 2.5 hours. */
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
    /** Price per unit, minor units. */
    unitAmountMinor: bigint('unit_amount_minor', { mode: 'bigint' }).notNull(),
    /**
     * quantity x unitAmountMinor, STORED rather than computed.
     *
     * A sent invoice must not change because a rounding rule changed. The line
     * total is a fact about the document, not a view over its inputs. See
     * `multiplyByQuantity` in src/lib/money.ts for the rule that produced it.
     */
    lineAmountMinor: bigint('line_amount_minor', { mode: 'bigint' }).notNull(),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('invoice_line_items_invoice_id_idx').on(t.invoiceId),
    // Ordering is unambiguous: no two lines on one invoice share a position.
    unique('invoice_line_items_invoice_position_key').on(t.invoiceId, t.position),
  ],
);

/* -------------------------------------------------------------------------- */
/* fxRates                                                                    */
/* -------------------------------------------------------------------------- */

export const fxRates = pgTable(
  'fx_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    // Append-only history: you need the rate as of a past payment, not just the
    // latest one. Including fetchedAt keeps every tick while making a repeated
    // fetch of the same tick idempotent.
    unique('fx_rates_base_quote_fetched_at_key').on(t.base, t.quote, t.fetchedAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Relations                                                                  */
/* -------------------------------------------------------------------------- */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  invoices: many(invoices),
  payments: many(payments),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  payments: many(payments),
  reminders: many(reminders),
  lineItems: many(invoiceLineItems),
}));

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  client: one(clients, {
    fields: [payments.clientId],
    references: [clients.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  invoice: one(invoices, {
    fields: [reminders.invoiceId],
    references: [invoices.id],
  }),
}));

/* -------------------------------------------------------------------------- */
/* Inferred types                                                             */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type NewInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;

export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type PaymentProvider = (typeof paymentProviderEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
export type ReminderChannel = (typeof reminderChannelEnum.enumValues)[number];
