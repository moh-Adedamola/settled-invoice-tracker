import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';

import { requireAdmin } from '@/lib/auth/guard';
import { getInvoice, type InvoiceDetail } from '@/lib/queries/invoices';
import { getSettings } from '@/lib/queries/settings';
import { InvoiceDocument } from '@/lib/pdf/invoice';

/**
 * TEMPORARY — verification only. Delete with the PDF review.
 *
 * Renders shapes the demo data does not contain (a 26-line invoice, a legacy
 * un-itemised one) so the page-break behaviour can be inspected on a real file.
 *
 * It exists as a route rather than a script because `@react-pdf/hyphenate` is
 * `"type": "module"` with an import-only exports map, and tsx resolves it
 * through the CJS loader, which cannot read that map. Next's bundler resolves
 * it correctly — so the route is not a workaround for a product problem, it is
 * the only runtime in this repo that can currently load the library at all.
 *
 * 404s outside development, and admin-gated in any case.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function synthetic(base: InvoiceDetail, patch: Partial<InvoiceDetail>): InvoiceDetail {
  return { ...base, ...patch };
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 });
  }
  await requireAdmin();

  const url = new URL(request.url);
  const scenario = url.searchParams.get('scenario') ?? 'many-lines';
  const sourceId = url.searchParams.get('from');
  if (!sourceId) return new NextResponse('Pass ?from=<invoiceId>', { status: 400 });

  const [base, settings] = await Promise.all([getInvoice(sourceId), getSettings()]);
  if (!base) return new NextResponse('No such invoice', { status: 404 });

  let invoice: InvoiceDetail;

  if (scenario === 'many-lines' || scenario === 'stress') {
    const lineItems = Array.from({ length: 26 }, (_, n) => ({
      id: `synthetic-${n}`,
      position: n + 1,
      description:
        n % 4 === 0
          ? `Discovery workshop, session ${n + 1} — stakeholder interviews and a written summary`
          : `Implementation sprint ${n + 1}`,
      quantity: n % 3 === 0 ? '2.000' : '1.000',
      unitAmountMinor: BigInt(125_000_00 + n * 1_500_00),
      lineAmountMinor: BigInt((n % 3 === 0 ? 2 : 1) * (125_000_00 + n * 1_500_00)),
    }));
    invoice = synthetic(base, {
      lineItems,
      amountMinor: lineItems.reduce((s, l) => s + l.lineAmountMinor, 0n),
      payments:
        scenario === 'stress'
          ? Array.from({ length: 9 }, (_, n) => ({
              id: `synthetic-pay-${n}`,
              provider: 'manual',
              providerPaymentId: `MAN-2026091${n}`,
              amountMinor: 500_000_00n,
              currency: base.currency,
              status: 'succeeded' as const,
              method: 'Bank transfer',
              occurredAt: new Date(Date.UTC(2026, 6, n + 1)),
              balanceAfterMinor: 0n,
            }))
          : [],
    });
  } else if (scenario === 'legacy') {
    invoice = synthetic(base, {
      lineItems: [],
      description:
        'Website redesign and CMS migration, phase 2. Agreed by email on 14 March; ' +
        'covers template build, content migration and two rounds of revisions.',
    });
  } else {
    return new NextResponse('Unknown scenario', { status: 400 });
  }

  const pdf = await renderToBuffer(InvoiceDocument({ invoice, settings }));

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="sample-${scenario}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
