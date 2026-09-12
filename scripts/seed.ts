/**
 * Demo data seeder — a CLI wrapper around the shared reset.
 *
 *   npm run seed
 *
 * All of the logic lives in `src/lib/demo/reset.ts`, which the nightly cron
 * route calls too. This file only formats the result for a terminal: there is
 * exactly one implementation of what demo data looks like and how it is
 * purged, so the script and the scheduled job cannot drift apart.
 *
 * Requires --conditions=react-server (wired into the npm script) because the
 * reset imports server-only modules.
 */
import { resetDemo, DemoResetBlockedError } from '../src/lib/demo/reset';

const SYMBOL: Record<string, string> = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };

function fmtMinor(minor: string, currency = 'NGN'): string {
  const value = BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? '-' : ''}${SYMBOL[currency] ?? currency}${(abs / 100n).toLocaleString(
    'en-US',
  )}.${String(abs % 100n).padStart(2, '0')}`;
}

const row = (label: string, value: string | number) =>
  `  ${label.padEnd(26)}${String(value).padStart(16)}`;

async function main() {
  const summary = await resetDemo();

  console.log(`\nSeeding demo data  (${summary.generatedAt.slice(0, 10)})\n`);

  console.log('  Purged');
  console.log(row('demo clients', summary.purged.demoClients));
  console.log(row('demo invoices', summary.purged.demoInvoices));
  console.log(row('demo payments', summary.purged.demoPayments));
  console.log(row('demo reminders', summary.purged.demoReminders));
  console.log(row('demo line items', summary.purged.demoLineItems));
  console.log(row('webhook events', summary.purged.webhookEvents));
  console.log(row('login attempts', summary.purged.loginAttempts));
  console.log(row('expired sessions', summary.purged.expiredSessions));

  console.log('\n  Inserted');
  console.log(row('clients', summary.inserted.clients));
  console.log(row('invoices', summary.inserted.invoices));
  console.log(row('line items', summary.inserted.lineItems));
  console.log(row('payments', summary.inserted.payments));
  console.log(row('reminders', summary.inserted.reminders));
  console.log(row('fx_rates', summary.inserted.fxRates));
  console.log(row('admin user', summary.admin));

  console.log('\n  Invoices by status');
  for (const status of ['draft', 'sent', 'paid', 'partial', 'overdue', 'void']) {
    const n = summary.totals.invoicesByStatus[status];
    if (n) console.log(row(`  ${status}`, n));
  }

  console.log('\n  Payments by status');
  for (const status of ['succeeded', 'pending', 'failed', 'refunded']) {
    const n = summary.totals.paymentsByStatus[status];
    if (n) console.log(row(`  ${status}`, n));
  }
  console.log(row('  unmatched (no invoice)', summary.totals.unmatchedPayments));

  console.log('\n  Money (NGN equivalent)');
  console.log(row('total revenue', fmtMinor(summary.totals.revenueMinor)));
  console.log(row('refunded', fmtMinor(summary.totals.refundedMinor)));
  console.log(row('outstanding', fmtMinor(summary.totals.outstandingMinor)));
  for (const unquoted of summary.totals.outstandingUnquoted) {
    console.log(
      row(`  no rate: ${unquoted.currency}`, fmtMinor(unquoted.minor, unquoted.currency)),
    );
  }
  console.log(
    row(
      'drafts (not counted)',
      `${summary.totals.draftCount} invoice${summary.totals.draftCount === 1 ? '' : 's'}`,
    ),
  );

  console.log(`\nDone in ${summary.durationMs}ms.\n`);
}

main().catch((error) => {
  if (error instanceof DemoResetBlockedError) {
    console.error('\nSeed refused to run:\n');
    console.error(`  ${error.message}\n`);
    console.error(
      '  Nothing was deleted. Either flag those rows as demo data or repoint\n' +
        '  them at live records, then run again.\n',
    );
    process.exit(2);
  }
  console.error('\nSeed failed:', error);
  process.exit(1);
});
