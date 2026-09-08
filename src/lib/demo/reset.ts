import 'server-only';

import { randomUUID } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';

import {
  clients,
  db,
  fxRates,
  invoiceLineItems,
  invoices,
  payments,
  reminders,
  users,
} from '@/lib/db';
import type {
  InvoiceStatus,
  NewClient,
  NewFxRate,
  NewInvoice,
  NewInvoiceLineItem,
  NewPayment,
  NewReminder,
  PaymentProvider,
  PaymentStatus,
} from '@/lib/db';
import { multiplyByQuantity } from '@/lib/money';
import { deleteExpiredSessions } from '@/lib/auth/session';
import { deleteOldAttempts } from '@/lib/auth/rate-limit';

/* ==========================================================================
   Demo dataset generation and the nightly reset.
   ==========================================================================

   This is the single implementation. `scripts/seed.ts` is a CLI wrapper around
   it and `/api/cron/reset-demo` is an HTTP wrapper around it; neither holds a
   second copy of the logic that decides what demo data looks like.

   Generation lives inside `buildDemoDataset()` rather than at module scope on
   purpose. At module scope the dataset would be computed once per process and
   then frozen — a warm serverless instance would keep reusing a `NOW` from
   hours or days earlier, so "the current month" would silently drift out of
   date. Calling the function produces a dataset anchored to the moment of the
   call.
   ========================================================================== */

export type DemoDataset = {
  clientRows: NewClient[];
  invoiceRows: NewInvoice[];
  paymentRows: NewPayment[];
  reminderRows: NewReminder[];
  fxRateRows: NewFxRate[];
  lineItemRows: NewInvoiceLineItem[];
  generatedAt: Date;
  /** Precomputed so callers do not need the internals to report a summary. */
  totals: {
    revenueMinor: bigint;
    refundedMinor: bigint;
    outstandingMinor: bigint;
    draftCount: number;
    invoicesByStatus: Record<string, number>;
    paymentsByStatus: Record<string, number>;
    unmatchedPayments: number;
  };
};

export function buildDemoDataset(): DemoDataset {
  /* -------------------------------------------------------------------------- */
  /* Deterministic RNG                                                          */
  /* -------------------------------------------------------------------------- */

  /** mulberry32 — same seed, same dataset, so re-runs are comparable. */
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = mulberry32(20260907);
  const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;

  function shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const token = (length: number, alphabet = ALNUM) =>
    Array.from({ length }, () => alphabet[Math.floor(rand() * alphabet.length)]).join('');
  const digits = (length: number) => token(length, '0123456789');

  /* -------------------------------------------------------------------------- */
  /* Time helpers                                                               */
  /* -------------------------------------------------------------------------- */

  const HOUR = 3_600_000;
  const DAY = 86_400_000;
  const NOW = new Date();
  const YEAR = NOW.getUTCFullYear();

  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
  const addHours = (d: Date, n: number) => new Date(d.getTime() + n * HOUR);
  const monthName = (d: Date) => d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  /** A business-hours timestamp inside the month `monthsAgo` before today. */
  function dateInMonth(monthsAgo: number): Date {
    const first = new Date(Date.UTC(YEAR, NOW.getUTCMonth() - monthsAgo, 1));
    const daysInMonth = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    // The current month is only partly elapsed — never issue an invoice in the future.
    const maxDay = monthsAgo === 0 ? Math.max(1, NOW.getUTCDate() - 1) : daysInMonth;
    return new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        randInt(1, maxDay),
        randInt(9, 17),
        randInt(0, 59),
      ),
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Money helpers                                                              */
  /* -------------------------------------------------------------------------- */

  type Currency = 'NGN' | 'USD' | 'GBP';


  /** Flat reference rates in NGN. Payments jitter around these. */
  const NGN_PER: Record<Currency, number> = { NGN: 1, USD: 1650, GBP: 2090 };

  /** major-unit range and rounding step per currency */
  const AMOUNT_RULES: Record<Currency, { min: number; max: number; step: number }> = {
    NGN: { min: 150_000, max: 2_500_000, step: 5_000 },
    USD: { min: 400, max: 6_000, step: 50 },
    GBP: { min: 300, max: 4_500, step: 50 },
  };

  /** Returns minor units as bigint. Never mixes bigint with number arithmetic. */
  function amountFor(currency: Currency): bigint {
    const { min, max, step } = AMOUNT_RULES[currency];
    const steps = randInt(Math.ceil(min / step), Math.floor(max / step));
    return BigInt(steps * step) * 100n;
  }


  /* -------------------------------------------------------------------------- */
  /* Clients                                                                    */
  /* -------------------------------------------------------------------------- */

  type ClientKind = 'school' | 'retail' | 'services';

  type ClientSeed = {
    name: string;
    localPart: string;
    domain: string;
    phone: string;
    currency: Currency;
    kind: ClientKind;
    providers: PaymentProvider[];
    notes: string;
  };

  const CLIENT_SEEDS: ClientSeed[] = [
    {
      name: 'Molek Schools',
      localPart: 'accounts',
      domain: 'molekschools.ng',
      phone: '+234 803 412 7788',
      currency: 'NGN',
      kind: 'school',
      providers: ['paystack'],
      notes: 'Two campuses in Ikeja and Magodo. Portal work is billed per term.',
    },
    {
      name: 'Sabi Foods Ltd',
      localPart: 'finance',
      domain: 'sabifoods.com.ng',
      phone: '+234 701 559 2043',
      currency: 'NGN',
      kind: 'retail',
      providers: ['paystack', 'flutterwave'],
      notes: 'Pays on the 25th of the month. Prefers transfer over card.',
    },
    {
      name: 'Adekunle & Sons',
      localPart: 'info',
      domain: 'adekunleandsons.ng',
      phone: '+234 802 771 6610',
      currency: 'NGN',
      kind: 'services',
      providers: ['flutterwave'],
      notes: 'Family-run. Invoices go to the MD directly, not to accounts.',
    },
    {
      name: 'Ikeja Dental Care',
      localPart: 'admin',
      domain: 'ikejadental.ng',
      phone: '+234 809 233 4471',
      currency: 'NGN',
      kind: 'services',
      providers: ['paystack'],
      notes: 'Booking system on a monthly retainer since March.',
    },
    {
      name: 'Ranti Logistics Ltd',
      localPart: 'accounts',
      domain: 'rantilogistics.com',
      phone: '+234 706 884 1129',
      currency: 'NGN',
      kind: 'services',
      providers: ['flutterwave', 'paystack'],
      notes: 'Slow payer — usually 2 weeks past terms. Chase early.',
    },
    {
      name: 'Green Pastures Montessori',
      localPart: 'bursar',
      domain: 'greenpastures.sch.ng',
      phone: '+234 805 190 3357',
      currency: 'NGN',
      kind: 'school',
      providers: ['paystack'],
      notes: 'Bursar approves, proprietor signs off. Allow a week.',
    },
    {
      name: 'Ovie Autos Nigeria',
      localPart: 'sales',
      domain: 'ovieautos.ng',
      phone: '+234 813 447 9026',
      currency: 'NGN',
      kind: 'retail',
      providers: ['flutterwave'],
      notes: 'Seasonal spend — heavier around December.',
    },
    {
      name: 'Chidera Pharma Ltd',
      localPart: 'accounts',
      domain: 'chiderapharma.com.ng',
      phone: '+234 807 662 5514',
      currency: 'NGN',
      kind: 'retail',
      providers: ['paystack'],
      notes: 'Inventory dashboard is the main engagement.',
    },
    {
      name: 'Zuma Ridge Properties',
      localPart: 'billing',
      domain: 'zumaridge.ng',
      phone: '+234 812 305 7748',
      currency: 'NGN',
      kind: 'services',
      providers: ['paystack', 'flutterwave'],
      notes: 'Abuja-based. Listings site plus quarterly photo shoots.',
    },
    {
      name: 'Threadcraft Apparel NG',
      localPart: 'hello',
      domain: 'threadcraft.ng',
      phone: '+234 810 928 6635',
      currency: 'NGN',
      kind: 'retail',
      providers: ['flutterwave'],
      notes: 'Shopify store. Wants WhatsApp order flow next quarter.',
    },
    {
      name: 'Northbank Studios',
      localPart: 'accounts',
      domain: 'northbankstudios.co.uk',
      phone: '+44 20 7946 0812',
      currency: 'GBP',
      kind: 'services',
      providers: ['stripe'],
      notes: 'London. Net 30, pays reliably on day 29.',
    },
    {
      name: 'Cadence Health Ltd',
      localPart: 'finance',
      domain: 'cadencehealth.co.uk',
      phone: '+44 161 496 0233',
      currency: 'GBP',
      kind: 'services',
      providers: ['stripe'],
      notes: 'Procurement requires a PO number on every invoice.',
    },
    {
      name: 'Brightlark Media LLC',
      localPart: 'ap',
      domain: 'brightlarkmedia.com',
      phone: '+1 415 555 0139',
      currency: 'USD',
      kind: 'services',
      providers: ['stripe'],
      notes: 'US client, invoiced in USD. Timezone: PT.',
    },
    {
      name: 'Harbor & Finch Consulting',
      localPart: 'billing',
      domain: 'harborandfinch.com',
      phone: '+1 212 555 0184',
      currency: 'USD',
      kind: 'services',
      providers: ['stripe'],
      notes: 'Retainer renews annually in January.',
    },
  ];

  /** Provider-shaped customer ids, only for the providers this client uses. */
  function providerCustomerIds(providers: PaymentProvider[]): Record<string, string> {
    const ids: Record<string, string> = {};
    for (const provider of providers) {
      if (provider === 'stripe') ids.stripe = `cus_${token(14)}`;
      if (provider === 'paystack') ids.paystack = `CUS_${token(15).toLowerCase()}`;
      if (provider === 'flutterwave') ids.flutterwave = digits(7);
    }
    return ids;
  }

  type BuiltClient = ClientSeed & { id: string; email: string };

  const builtClients: BuiltClient[] = CLIENT_SEEDS.map((seed) => ({
    ...seed,
    id: randomUUID(),
    email: `${seed.localPart}@${seed.domain}`,
  }));

  const clientRows: NewClient[] = builtClients.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    providerCustomerIds: providerCustomerIds(c.providers),
    notes: c.notes,
    isDemo: true,
  }));

  /* -------------------------------------------------------------------------- */
  /* Invoices                                                                   */
  /* -------------------------------------------------------------------------- */

  const GENERIC_LINE_ITEMS: ((d: Date) => string)[] = [
    () => `Website redesign — phase ${randInt(1, 3)}`,
    (d) => `WhatsApp automation retainer, ${monthName(d)}`,
    (d) => `Monthly SEO retainer, ${monthName(d)}`,
    () => 'Brand identity refresh',
    () => 'Landing page + paid ads setup',
    () => 'Payment gateway integration (Paystack)',
    () => 'Annual hosting and SSL renewal',
    () => 'Bug fixes and performance pass',
    () => `Mobile app UI design — ${randInt(6, 24)} screens`,
    () => 'Staff training session — CMS handover',
    () => 'Google Business profile setup + photography',
    () => 'Customer support chatbot — discovery',
  ];

  const KIND_LINE_ITEMS: Record<ClientKind, ((d: Date) => string)[]> = {
    school: [
      () => 'School portal maintenance',
      () => 'Result checker module — term rollover',
      (d) => `Parent SMS broadcast credits, ${monthName(d)}`,
      () => 'Admissions form redesign',
    ],
    retail: [
      () => 'E-commerce build — Shopify migration',
      () => `Inventory dashboard — sprint ${randInt(1, 4)}`,
      () => 'Product photography — 40 SKUs',
      () => 'Abandoned cart email flow',
    ],
    services: [
      () => 'Booking system maintenance',
      () => 'Client portal — document uploads',
      (d) => `Analytics reporting retainer, ${monthName(d)}`,
      () => 'Content shoot — half day',
    ],
  };

  function describeFor(client: BuiltClient, when: Date): string {
    const pool = rand() < 0.4 ? KIND_LINE_ITEMS[client.kind] : GENERIC_LINE_ITEMS;
    return pick(pool)(when);
  }

  type BuiltInvoice = {
    id: string;
    number: string;
    client: BuiltClient;
    currency: Currency;
    amountMinor: bigint;
    status: InvoiceStatus;
    description: string;
    issuedAt: Date | null;
    dueAt: Date | null;
    sentAt: Date | null;
    paidAt: Date | null;
    createdAt: Date;
  };

  /**
   * Volume trends upward month over month so the revenue chart has a story.
   * Index 0 is five months ago; index 5 is the current month. These are only the
   * paid + void invoices.
   *
   * The two most recent months are deliberately dipped. Overdue and sent
   * invoices get their dates derived backwards from a fixed age relative to
   * today, so with 14/30-day terms they all land in July and August — roughly
   * five apiece. Setting those buckets to a flat 8/9 stacked on top of that and
   * made July overshoot August. The dip leaves room for the top-up; the curve
   * you actually see is 5, 6, 7, 10, 12.
   *
   * Re-tune by measuring, not by reasoning: change these numbers, re-seed, and
   * group invoices by month. Keeping the post-scaling total constant preserves
   * the RNG stream, so the derived invoices stay put while you move the buckets.
   */
  const MONTHLY_VOLUME = [5, 6, 7, 5, 7, 2];

  /**
   * The current month is only partly elapsed, so its full target would read as a
   * growth spike on the chart rather than a normal month in progress. Scale it by
   * the fraction of the month that has actually happened.
   */
  const DAYS_IN_CURRENT_MONTH = new Date(Date.UTC(YEAR, NOW.getUTCMonth() + 1, 0)).getUTCDate();
  const MONTH_ELAPSED = NOW.getUTCDate() / DAYS_IN_CURRENT_MONTH;
  const volumeFor = (monthsAgo: number, target: number) =>
    monthsAgo === 0 ? Math.max(1, Math.round(target * MONTH_ELAPSED)) : target;

  /** Ages in days past due — spread so every reminder sequence has material. */
  const OVERDUE_AGES = [5, 8, 12, 16, 22, 31, 40];

  const clientsByCurrency: Record<Currency, BuiltClient[]> = {
    NGN: builtClients.filter((c) => c.currency === 'NGN'),
    USD: builtClients.filter((c) => c.currency === 'USD'),
    GBP: builtClients.filter((c) => c.currency === 'GBP'),
  };

  // 70% NGN / 20% USD / 10% GBP across 60 invoices, exactly.
  const currencyPlan = shuffle([
    ...Array<Currency>(42).fill('NGN'),
    ...Array<Currency>(12).fill('USD'),
    ...Array<Currency>(6).fill('GBP'),
  ]);
  let currencyCursor = 0;
  const nextCurrency = (): Currency => currencyPlan[currencyCursor++ % currencyPlan.length]!;

  const draftInvoices: BuiltInvoice[] = [];
  const builtInvoices: BuiltInvoice[] = [];

  function makeInvoice(args: {
    status: InvoiceStatus;
    issuedAt: Date | null;
    dueAt: Date | null;
    createdAt: Date;
  }): BuiltInvoice {
    const currency = nextCurrency();
    const client = pick(clientsByCurrency[currency]);
    const when = args.issuedAt ?? args.createdAt;
    const sent = args.status === 'draft' ? null : args.issuedAt;
    return {
      id: randomUUID(),
      number: '', // assigned after the whole set is sorted by date
      client,
      currency,
      amountMinor: amountFor(currency),
      status: args.status,
      description: describeFor(client, when),
      issuedAt: args.issuedAt,
      dueAt: args.dueAt,
      sentAt: sent,
      paidAt: null, // filled in when the payment is generated
      createdAt: args.createdAt,
    };
  }

  // --- paid and void, dated from the monthly buckets --------------------------
  const bucketDates: Date[] = [];
  MONTHLY_VOLUME.forEach((count, index) => {
    const monthsAgo = MONTHLY_VOLUME.length - 1 - index;
    const target = volumeFor(monthsAgo, count);
    for (let n = 0; n < target; n++) bucketDates.push(dateInMonth(monthsAgo));
  });

  const bucketStatuses = shuffle([
    ...Array<InvoiceStatus>(2).fill('void'),
    ...Array<InvoiceStatus>(bucketDates.length - 2).fill('paid'),
  ]);

  bucketDates.forEach((issuedAt, index) => {
    const term = pick([14, 30]);
    builtInvoices.push(
      makeInvoice({
        status: bucketStatuses[index]!,
        issuedAt,
        dueAt: addDays(issuedAt, term),
        createdAt: addHours(issuedAt, -randInt(1, 6)),
      }),
    );
  });

  // --- overdue (7), dates forced so the reminder ladder is fully populated ----
  for (const age of OVERDUE_AGES) {
    const term = pick([14, 30]);
    const dueAt = addDays(NOW, -age);
    const issuedAt = addDays(dueAt, -term);
    builtInvoices.push({
      ...makeInvoice({ status: 'overdue', issuedAt, dueAt, createdAt: addHours(issuedAt, -2) }),
    });
  }

  // --- sent, issued but not yet due (6) --------------------------------------
  for (let n = 0; n < 6; n++) {
    const term = pick([14, 30]);
    const dueAt = addDays(NOW, randInt(3, Math.min(12, term - 2)));
    const issuedAt = addDays(dueAt, -term);
    builtInvoices.push(
      makeInvoice({ status: 'sent', issuedAt, dueAt, createdAt: addHours(issuedAt, -2) }),
    );
  }

  // --- draft (3): never issued, so no issuedAt/dueAt/sentAt ------------------
  for (let n = 0; n < 3; n++) {
    const createdAt = addDays(NOW, -randInt(1, 21));
    const draft = makeInvoice({ status: 'draft', issuedAt: null, dueAt: null, createdAt });
    builtInvoices.push(draft);
    draftInvoices.push(draft);
  }

  // Sequential numbering follows date order, the way a real ledger reads.
  builtInvoices.sort(
    (a, b) => (a.issuedAt ?? a.createdAt).getTime() - (b.issuedAt ?? b.createdAt).getTime(),
  );
  builtInvoices.forEach((invoice, index) => {
    invoice.number = `INV-${YEAR}-${String(index + 1).padStart(4, '0')}`;
  });

  /* -------------------------------------------------------------------------- */
  /* Payments                                                                   */
  /* -------------------------------------------------------------------------- */

  const PROVIDER_METHODS: Record<PaymentProvider, string[]> = {
    paystack: ['card', 'bank_transfer', 'ussd'],
    flutterwave: ['card', 'bank_transfer', 'mobile_money'],
    stripe: ['card', 'card', 'bank_debit'],
    manual: ['bank_transfer', 'cash'],
  };

  function providerPaymentId(provider: PaymentProvider): string {
    switch (provider) {
      case 'stripe':
        return `pi_3O${token(22)}`;
      case 'paystack':
        return digits(10);
      case 'flutterwave':
        return `FLW-${token(12).toUpperCase()}`;
      case 'manual':
        return `MAN-${digits(8)}`;
    }
  }

  /** NGN clients pay locally; USD/GBP always route through Stripe. */
  function providerFor(client: BuiltClient, currency: Currency): PaymentProvider {
    if (currency !== 'NGN') return 'stripe';
    const local = client.providers.filter((p) => p !== 'stripe');
    return local.length > 0 ? pick(local) : 'paystack';
  }

  type FxFields = {
    baseAmountMinor: bigint | null;
    fxRate: string | null;
    fxAt: Date | null;
  };

  /**
   * NGN is the reporting base, so NGN payments carry no conversion at all.
   * fxRate is numeric in Postgres and maps to string in Drizzle — pass a string.
   */
  function fxFor(currency: Currency, amountMinor: bigint, at: Date): FxFields {
    if (currency === 'NGN') return { baseAmountMinor: null, fxRate: null, fxAt: null };
    const rate = NGN_PER[currency] * (1 + (rand() - 0.5) * 0.04);
    return {
      // amountMinor is in cents/pence; cents * (NGN per unit) = kobo.
      baseAmountMinor: BigInt(Math.round(Number(amountMinor) * rate)),
      fxRate: rate.toFixed(8),
      fxAt: at,
    };
  }

  /** Keeps a generated timestamp inside [issuedAt + 1h, now - 1h]. */
  function clamp(at: Date, notBefore: Date): Date {
    const upper = NOW.getTime() - HOUR;
    const lower = notBefore.getTime() + HOUR;
    return new Date(Math.max(lower, Math.min(at.getTime(), upper)));
  }

  const paymentRows: NewPayment[] = [];

  function addPayment(args: {
    invoice: BuiltInvoice | null;
    client: BuiltClient | null;
    currency: Currency;
    amountMinor: bigint;
    status: PaymentStatus;
    occurredAt: Date;
    provider?: PaymentProvider;
  }) {
    const provider =
      args.provider ??
      (args.client ? providerFor(args.client, args.currency) : pick(['paystack', 'stripe'] as const));
    const fx = fxFor(args.currency, args.amountMinor, args.occurredAt);
    paymentRows.push({
      id: randomUUID(),
      invoiceId: args.invoice?.id ?? null,
      clientId: args.client?.id ?? null,
      provider,
      providerPaymentId: providerPaymentId(provider),
      amountMinor: args.amountMinor,
      currency: args.currency,
      status: args.status,
      method: pick(PROVIDER_METHODS[provider]),
      occurredAt: args.occurredAt,
      isDemo: true,
      ...fx,
    });
  }

  const paidInvoices = builtInvoices.filter((i) => i.status === 'paid');
  const overdueInvoices = builtInvoices.filter((i) => i.status === 'overdue');
  const sentInvoices = builtInvoices.filter((i) => i.status === 'sent');

  // One succeeded payment per paid invoice — most on time, a quarter of them late.
  for (const invoice of paidInvoices) {
    const issuedAt = invoice.issuedAt!;
    const dueAt = invoice.dueAt!;
    const late = rand() < 0.25;
    const raw = late
      ? addDays(dueAt, randInt(1, 6))
      : new Date(issuedAt.getTime() + rand() * Math.max(DAY, dueAt.getTime() - issuedAt.getTime()));
    const occurredAt = clamp(raw, issuedAt);
    invoice.paidAt = occurredAt;
    addPayment({
      invoice,
      client: invoice.client,
      currency: invoice.currency,
      amountMinor: invoice.amountMinor,
      status: 'succeeded',
      occurredAt,
    });
  }

  // 4 failed attempts — two on overdue invoices (which is why they went unpaid),
  // two on invoices still in flight.
  for (const invoice of [...overdueInvoices.slice(0, 2), ...sentInvoices.slice(0, 2)]) {
    addPayment({
      invoice,
      client: invoice.client,
      currency: invoice.currency,
      amountMinor: invoice.amountMinor,
      status: 'failed',
      occurredAt: clamp(addDays(invoice.issuedAt!, randInt(1, 10)), invoice.issuedAt!),
    });
  }

  // 2 pending authorisations on sent invoices.
  for (const invoice of sentInvoices.slice(2, 4)) {
    addPayment({
      invoice,
      client: invoice.client,
      currency: invoice.currency,
      amountMinor: invoice.amountMinor,
      status: 'pending',
      occurredAt: clamp(addHours(NOW, -randInt(3, 40)), invoice.issuedAt!),
    });
  }

  // 1 refund, sitting alongside the original succeeded payment on that invoice.
  const refunded = paidInvoices[Math.floor(rand() * paidInvoices.length)]!;
  addPayment({
    invoice: refunded,
    client: refunded.client,
    currency: refunded.currency,
    amountMinor: refunded.amountMinor,
    status: 'refunded',
    occurredAt: clamp(addDays(refunded.paidAt!, randInt(3, 10)), refunded.paidAt!),
  });

  // 3 unmatched payments — money arrived, nothing to attach it to yet. These are
  // what the manual-matching queue in the UI works through. Two are fully
  // anonymous; one resolved to a known customer id but not to an invoice.
  const unmatchedClient = pick(clientsByCurrency.NGN);
  addPayment({
    invoice: null,
    client: unmatchedClient,
    currency: 'NGN',
    amountMinor: amountFor('NGN'),
    status: 'succeeded',
    occurredAt: addHours(NOW, -randInt(12, 200)),
    provider: providerFor(unmatchedClient, 'NGN'),
  });
  addPayment({
    invoice: null,
    client: null,
    currency: 'NGN',
    amountMinor: amountFor('NGN'),
    status: 'succeeded',
    occurredAt: addHours(NOW, -randInt(12, 400)),
    provider: 'flutterwave',
  });
  addPayment({
    invoice: null,
    client: null,
    currency: 'USD',
    amountMinor: amountFor('USD'),
    status: 'succeeded',
    occurredAt: addHours(NOW, -randInt(12, 400)),
    provider: 'stripe',
  });

  /* -------------------------------------------------------------------------- */
  /* Reminders                                                                  */
  /* -------------------------------------------------------------------------- */

  /** sequence -> minimum days past due before that nudge goes out */
  const REMINDER_LADDER: { sequence: number; afterDays: number }[] = [
    { sequence: 1, afterDays: 3 },
    { sequence: 2, afterDays: 7 },
    { sequence: 3, afterDays: 14 },
  ];

  const reminderRows: NewReminder[] = [];

  for (const invoice of overdueInvoices) {
    const dueAt = invoice.dueAt!;
    const daysLate = Math.floor((NOW.getTime() - dueAt.getTime()) / DAY);
    for (const step of REMINDER_LADDER) {
      if (daysLate < step.afterDays) continue;
      // One row per (invoiceId, sequence) — the composite unique makes a
      // double-send impossible even if two cron runs overlap.
      reminderRows.push({
        id: randomUUID(),
        invoiceId: invoice.id,
        sequence: step.sequence,
        channel: 'email',
        sentAt: clamp(addHours(addDays(dueAt, step.afterDays), randInt(0, 8)), dueAt),
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /* FX rates                                                                   */
  /* -------------------------------------------------------------------------- */

  // 30 days x 2 pairs = 60 rows. fetchedAt is pinned to 06:00 UTC so the
  // (base, quote, fetchedAt) unique makes a same-day re-run a no-op.
  const FX_DAYS = 30;
  const fxRateRows: NewFxRate[] = [];

  for (const quotePair of [{ base: 'USD' as const }, { base: 'GBP' as const }]) {
    let rate = NGN_PER[quotePair.base] * (1 - 0.015);
    for (let back = FX_DAYS - 1; back >= 0; back--) {
      rate *= 1 + (rand() - 0.48) * 0.006; // gentle drift, mild upward bias
      const day = addDays(NOW, -back);
      fxRateRows.push({
        id: randomUUID(),
        base: quotePair.base,
        quote: 'NGN',
        rate: rate.toFixed(8),
        fetchedAt: new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 6, 0, 0),
        ),
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Invoice rows                                                               */
  /* -------------------------------------------------------------------------- */

  const invoiceRows: NewInvoice[] = builtInvoices.map((i) => ({
    id: i.id,
    number: i.number,
    clientId: i.client.id,
    amountMinor: i.amountMinor,
    currency: i.currency,
    status: i.status,
    description: i.description,
    issuedAt: i.issuedAt,
    dueAt: i.dueAt,
    sentAt: i.sentAt,
    paidAt: i.paidAt,
    isDemo: true,
    createdAt: i.createdAt,
  }));

  /* ---------------------------------------------------------------------- */
  /* Line items                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Line items are ALLOCATED FROM the invoice total, never summed up to it.
   *
   * Building lines independently and hoping they add up is how rounding drift
   * gets into a ledger: each `round(quantity x unit)` can move by a kobo, and
   * four of those against a stored total is a discrepancy with no symptom. So
   * every line but the last takes a chunk of what remains, and the last line
   * takes the exact remainder. The sum equals the total by construction rather
   * than by luck, which is also what the deferred constraint trigger enforces
   * in the database.
   */
  const PHASE_ITEMS = [
    'Discovery and scoping',
    'Design — phase 1',
    'Design — phase 2',
    'Build — sprint 1',
    'Build — sprint 2',
    'Frontend implementation',
    'Backend implementation',
    'Content migration',
    'QA and browser testing',
    'Launch and handover',
  ];

  const RECURRING_ITEMS = [
    'Support retainer',
    'Managed hosting',
    'SSL and domain renewal',
    'Analytics reporting retainer',
    'Backup and monitoring',
  ];

  const INTEGRATION_ITEMS = [
    'Paystack integration',
    'Flutterwave integration',
    'WhatsApp Business API setup',
    'Email delivery configuration',
    'SSO and access control',
  ];

  const CLOSING_ITEMS = [
    'Project management',
    'Consultancy and advisory',
    'Implementation services',
    'Configuration and setup',
  ];

  /** Quantities that read naturally on an agency invoice. */
  const QUANTITIES = [1, 1, 1, 1, 2, 3, 0.5, 1.5, 2.5, 4];

  /** Round a unit price to something a human would have quoted. */
  const tidyUnit = (minor: bigint, step: bigint): bigint => {
    const rounded = (minor / step) * step;
    return rounded > 0n ? rounded : step;
  };

  const lineItemRows: NewInvoiceLineItem[] = [];

  for (const invoice of builtInvoices) {
    const total = invoice.amountMinor;

    // Small invoices read oddly split four ways.
    const maxLines = total < 30_000_00n ? 2 : 4;
    const lineCount = randInt(1, maxLines);

    // Unit prices land on whole currency units for NGN, and on 50 minor units
    // (£0.50 / $0.50) for the foreign currencies, which is how they are quoted.
    const step = invoice.currency === 'NGN' ? 100n : 50n;

    let remaining = total;
    let position = 0;

    for (let n = 0; n < lineCount - 1; n++) {
      // Never take more than 45% of what is left, so the closing line always
      // has something meaningful to absorb.
      const cap = (remaining * 45n) / 100n;
      if (cap <= step * 2n) break;

      const quantityNumber = pick(QUANTITIES);
      const scaledQuantity = BigInt(Math.round(quantityNumber * 1000));
      const chunk = (cap * BigInt(randInt(40, 95))) / 100n;

      const unitAmountMinor = tidyUnit((chunk * 1000n) / scaledQuantity, step);
      const quantity = quantityNumber.toFixed(3);
      const lineAmountMinor = multiplyByQuantity(quantity, unitAmountMinor);

      // Skip anything that would consume the remainder or contribute nothing.
      if (lineAmountMinor <= 0n || lineAmountMinor >= remaining) continue;

      const pool =
        n === 0 ? PHASE_ITEMS : rand() < 0.5 ? INTEGRATION_ITEMS : RECURRING_ITEMS;

      position += 1;
      lineItemRows.push({
        id: randomUUID(),
        invoiceId: invoice.id,
        position,
        description: pick(pool),
        quantity,
        unitAmountMinor,
        lineAmountMinor,
        isDemo: true,
        createdAt: invoice.createdAt,
        updatedAt: invoice.createdAt,
      });

      remaining -= lineAmountMinor;
    }

    // The closing line takes the exact remainder at quantity 1, so the set sums
    // to the invoice total to the kobo no matter what the lines above rounded to.
    position += 1;
    lineItemRows.push({
      id: randomUUID(),
      invoiceId: invoice.id,
      position,
      description: position === 1 ? invoice.description : pick(CLOSING_ITEMS),
      quantity: '1.000',
      unitAmountMinor: remaining,
      lineAmountMinor: remaining,
      isDemo: true,
      createdAt: invoice.createdAt,
      updatedAt: invoice.createdAt,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Totals                                                                  */
  /* ---------------------------------------------------------------------- */

  // Revenue: succeeded payments only, normalised to NGN via the stored
  // baseAmountMinor (null for NGN, which needs no conversion).
  const revenueMinor = paymentRows
    .filter((p) => p.status === 'succeeded')
    .reduce((sum, p) => sum + (p.baseAmountMinor ?? p.amountMinor!), 0n);

  const refundedMinor = paymentRows
    .filter((p) => p.status === 'refunded')
    .reduce((sum, p) => sum + (p.baseAmountMinor ?? p.amountMinor!), 0n);

  // Outstanding: issued but unpaid, at the flat reference rates.
  const outstandingMinor = builtInvoices
    .filter((i) => i.status === 'sent' || i.status === 'overdue' || i.status === 'partial')
    .reduce(
      (sum, i) => sum + BigInt(Math.round(Number(i.amountMinor) * NGN_PER[i.currency])),
      0n,
    );

  const invoicesByStatus = builtInvoices.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  const paymentsByStatus = paymentRows.reduce<Record<string, number>>((acc, p) => {
    const key = String(p.status);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return {
    clientRows,
    invoiceRows,
    paymentRows,
    reminderRows,
    fxRateRows,
    lineItemRows,
    generatedAt: NOW,
    totals: {
      revenueMinor,
      refundedMinor,
      outstandingMinor,
      draftCount: draftInvoices.length,
      invoicesByStatus,
      paymentsByStatus,
      unmatchedPayments: paymentRows.filter((p) => !p.invoiceId).length,
    },
  };
}


/* ==========================================================================
   Retention
   ==========================================================================

   `webhook_events` grows forever otherwise — every test run, every retry, every
   probe. Four rules, in priority order:

   1. NEVER delete an unprocessed, signature-verified event. That is pending
      work. This includes rows that have exhausted their retries: those are
      dead letters awaiting a human, and deleting them would hide a failure
      rather than fix it.

   2. Delete processed test-mode events at any age. They exist only because
      someone was testing, they have already produced their (demo) records, and
      keeping them just means the table grows in proportion to how often the
      pipeline is exercised.

   3. Delete processed events older than 7 days regardless of mode. Once
      processed, the payment row IS the record; the raw payload is a debugging
      convenience with a short useful life.

   4. Delete quarantined (signature_ok = false) events after 90 days, not 7.
      These are the only trace that someone POSTed an unsigned payload at the
      endpoint, which is worth keeping around far longer than a routine
      delivery. Not kept indefinitely, though: anyone can generate them at will,
      so unbounded retention hands a stranger a way to grow the table. Ninety
      days is long enough to notice a pattern and short enough to bound the
      damage — change the constant if that trade looks wrong.
   ========================================================================== */

const PROCESSED_RETENTION_DAYS = 7;
const QUARANTINE_RETENTION_DAYS = 90;

/* ==========================================================================
   Preflight
   ========================================================================== */

export type DanglingReference = {
  kind: string;
  id: string;
  label: string;
  references: string;
};

/**
 * Finds live rows that point at demo rows.
 *
 * `payments.client_id` and `payments.invoice_id` carry no ON DELETE clause, so
 * deleting a demo client out from under a live payment raises a foreign key
 * violation and aborts the whole reset — leaving the database half-purged with
 * no demo data and no explanation.
 *
 * The processor's demo -> live client promotion exists to keep this set empty,
 * but a reset that trusts an invariant it can cheaply verify is a reset that
 * fails confusingly the one time the invariant is wrong. Checking first turns a
 * raw Postgres error into a message naming the exact offending records.
 */
export async function findDanglingLiveReferences(): Promise<DanglingReference[]> {
  const result = await db.execute(sql`
    select 'payment' as kind, p.id::text as id,
           p.provider_payment_id as label, 'demo client' as references_what
    from payments p
    join clients c on c.id = p.client_id
    where p.is_demo = false and c.is_demo = true

    union all

    select 'payment', p.id::text, p.provider_payment_id, 'demo invoice'
    from payments p
    join invoices i on i.id = p.invoice_id
    where p.is_demo = false and i.is_demo = true

    union all

    select 'invoice', i.id::text, i.number, 'demo client'
    from invoices i
    join clients c on c.id = i.client_id
    where i.is_demo = false and c.is_demo = true
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    kind: String(row.kind),
    id: String(row.id),
    label: String(row.label),
    references: String(row.references_what),
  }));
}

/* ==========================================================================
   Admin user
   ========================================================================== */

/**
 * Ensures an admin exists. Never modifies one that already does.
 *
 * `onConflictDoNothing` on the email is what makes this safe to run nightly:
 * an existing admin keeps its password hash, its role and its id. The reset
 * must never log anyone out of their own product.
 */
async function ensureAdminUser(): Promise<'inserted' | 'kept'> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@refacint.com';

  // Not a valid hash of anything, so nothing can verify against it. Only used
  // when the account does not exist at all; `npm run set-password` replaces it.
  const PLACEHOLDER_PASSWORD_HASH = '!seed-placeholder-no-login-until-auth-phase';

  const inserted = await db
    .insert(users)
    .values({
      id: randomUUID(),
      email,
      passwordHash: PLACEHOLDER_PASSWORD_HASH,
      role: 'admin',
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  return inserted.length > 0 ? 'inserted' : 'kept';
}

/* ==========================================================================
   Reset
   ========================================================================== */

export type ResetSummary = {
  ok: true;
  durationMs: number;
  generatedAt: string;
  purged: {
    demoInvoices: number;
    demoReminders: number;
    demoPayments: number;
    demoClients: number;
    webhookEvents: number;
    loginAttempts: number;
    expiredSessions: number;
    demoLineItems: number;
  };
  inserted: {
    clients: number;
    invoices: number;
    lineItems: number;
    payments: number;
    reminders: number;
    fxRates: number;
  };
  admin: 'inserted' | 'kept';
  totals: {
    revenueMinor: string;
    refundedMinor: string;
    outstandingMinor: string;
    draftCount: number;
    invoicesByStatus: Record<string, number>;
    paymentsByStatus: Record<string, number>;
    unmatchedPayments: number;
  };
};

export class DemoResetBlockedError extends Error {
  readonly dangling: DanglingReference[];

  constructor(dangling: DanglingReference[]) {
    super(
      `Demo reset aborted: ${dangling.length} live row(s) reference demo rows. ` +
        `Deleting the demo data would raise a foreign key violation. Offending records: ` +
        dangling
          .map((d) => `${d.kind} ${d.label} (${d.id}) -> ${d.references}`)
          .join('; '),
    );
    this.name = 'DemoResetBlockedError';
    this.dangling = dangling;
  }
}

/**
 * Restores the demo dataset and clears accumulated test debris.
 *
 * Never touches: any row with `isDemo = false`, the `users` table, or
 * `fx_rates`. fx_rates has no demo flag and purging it by date would delete
 * rates the app fetched for real conversions; the composite unique plus
 * `onConflictDoNothing` already makes re-inserting safe.
 */
export async function resetDemo(): Promise<ResetSummary> {
  const startedAt = Date.now();

  // Fail before deleting anything, with a message that names names.
  const dangling = await findDanglingLiveReferences();
  if (dangling.length > 0) throw new DemoResetBlockedError(dangling);

  const dataset = buildDemoDataset();

  /* --- purge, FK-safe: reminders -> payments -> invoices -> clients ------- */
  const demoInvoiceIds = (
    await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.isDemo, true))
  ).map((row) => row.id);

  let demoReminders = 0;
  let demoLineItems = 0;
  if (demoInvoiceIds.length > 0) {
    // Line items would cascade with their invoice anyway; deleting them
    // explicitly just gives the summary an honest count.
    demoLineItems = (
      await db
        .delete(invoiceLineItems)
        .where(inArray(invoiceLineItems.invoiceId, demoInvoiceIds))
        .returning({ id: invoiceLineItems.id })
    ).length;

    // Reminders carry no isDemo of their own, so they are scoped through their
    // parent invoice.
    demoReminders = (
      await db
        .delete(reminders)
        .where(inArray(reminders.invoiceId, demoInvoiceIds))
        .returning({ id: reminders.id })
    ).length;
  }

  const demoPayments = (
    await db.delete(payments).where(eq(payments.isDemo, true)).returning({ id: payments.id })
  ).length;
  const demoInvoices = (
    await db.delete(invoices).where(eq(invoices.isDemo, true)).returning({ id: invoices.id })
  ).length;
  const demoClients = (
    await db.delete(clients).where(eq(clients.isDemo, true)).returning({ id: clients.id })
  ).length;

  /* --- retention: webhook events ----------------------------------------- */
  const purgedEvents = (
    await db.execute(sql`
      delete from webhook_events
      where
        -- processed test-mode deliveries, any age
        (processed_at is not null and payload -> 'data' ->> 'domain' = 'test')
        -- processed deliveries past their useful debugging life
        or (processed_at is not null
            and received_at < now() - make_interval(days => ${PROCESSED_RETENTION_DAYS}::int))
        -- old quarantined probes
        or (signature_ok = false
            and received_at < now() - make_interval(days => ${QUARANTINE_RETENTION_DAYS}::int))
      returning id
    `)
  ).rows.length;

  /* --- retention: auth tables -------------------------------------------- */
  const purgedAttempts = await deleteOldAttempts();
  const purgedSessions = await deleteExpiredSessions();

  /* --- reinsert ----------------------------------------------------------- */
  await db.insert(clients).values(dataset.clientRows);
  await db.insert(invoices).values(dataset.invoiceRows);
  /**
   * One statement for every line on every invoice. The constraint trigger is
   * deferred to commit, and neon-http gives each statement its own implicit
   * transaction — so a set inserted across several statements would be checked
   * mid-way, when the sums legitimately do not balance yet.
   */
  await db.insert(invoiceLineItems).values(dataset.lineItemRows);
  await db.insert(payments).values(dataset.paymentRows);
  if (dataset.reminderRows.length > 0) {
    await db.insert(reminders).values(dataset.reminderRows);
  }
  await db.insert(fxRates).values(dataset.fxRateRows).onConflictDoNothing();

  const admin = await ensureAdminUser();

  return {
    ok: true,
    durationMs: Date.now() - startedAt,
    generatedAt: dataset.generatedAt.toISOString(),
    purged: {
      demoInvoices,
      demoReminders,
      demoPayments,
      demoClients,
      webhookEvents: purgedEvents,
      loginAttempts: purgedAttempts,
      expiredSessions: purgedSessions,
      demoLineItems,
    },
    inserted: {
      clients: dataset.clientRows.length,
      invoices: dataset.invoiceRows.length,
      lineItems: dataset.lineItemRows.length,
      payments: dataset.paymentRows.length,
      reminders: dataset.reminderRows.length,
      fxRates: dataset.fxRateRows.length,
    },
    admin,
    totals: {
      // bigint does not survive JSON.stringify; the route returns this verbatim.
      revenueMinor: dataset.totals.revenueMinor.toString(),
      refundedMinor: dataset.totals.refundedMinor.toString(),
      outstandingMinor: dataset.totals.outstandingMinor.toString(),
      draftCount: dataset.totals.draftCount,
      invoicesByStatus: dataset.totals.invoicesByStatus,
      paymentsByStatus: dataset.totals.paymentsByStatus,
      unmatchedPayments: dataset.totals.unmatchedPayments,
    },
  };
}
