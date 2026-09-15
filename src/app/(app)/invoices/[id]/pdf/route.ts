import { NextResponse } from 'next/server';

import { readScope } from '@/lib/auth/guard';
import { getInvoice } from '@/lib/queries/invoices';
import {
  InvoiceNotFoundError,
  invoicePdfFilename,
  renderInvoicePdf,
} from '@/lib/pdf/invoice';

/**
 * The invoice as a PDF.
 *
 * A GET, and legitimately so: this reads, it does not mutate, so the
 * sameSite=lax rule that makes every write a POST does not apply. It is gated
 * by `requireUser` like every other route that renders a record — a PDF is the
 * same client names and sums as the detail page, in a form that is easier to
 * forward.
 *
 * `inline` rather than `attachment`, so a click opens it in the browser's
 * viewer instead of dropping a file in Downloads. `?download=1` flips it, for
 * the case where someone actually wants the file.
 *
 * Rendering is CPU work and shapes a whole page of output, so it runs on the
 * Node runtime rather than the edge: @react-pdf/renderer needs `fs` to read the
 * registered font files.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  /*
   * Public for demo invoices, because the landing page tells a visitor they
   * can read the PDF. Live invoices are unreachable here for the same reason
   * they are on the detail page: the scope is part of the query, so a live id
   * renders nothing and returns 404.
   */
  const scope = await readScope();

  const { id } = await params;

  try {
    const [pdf, invoice] = await Promise.all([
      renderInvoicePdf(id, scope),
      getInvoice(id, scope),
    ]);
    if (!invoice) return new NextResponse('Not found', { status: 404 });

    const download = new URL(request.url).searchParams.get('download') === '1';

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${invoicePdfFilename(invoice)}"`,
        'Content-Length': String(pdf.length),
        // The figures move whenever a payment lands, so a cached PDF would show
        // a balance that is no longer true.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return new NextResponse('Not found', { status: 404 });
    }
    throw error;
  }
}
