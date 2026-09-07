import type { InvoiceStatus, PaymentStatus } from '@/lib/db';

/**
 * The seven presentation states from docs/design-system.md §3.2.
 *
 * HARD RULE (§3.3): a badge without its marker is a bug. Colour and marker are
 * obtained from the same record, so a consumer cannot reach one without the
 * other — that is the whole point of this shape. Do not read the status colour
 * tokens directly anywhere else.
 *
 * The Tailwind classes are written out in full rather than composed, because
 * Tailwind scans source text and cannot see a class built at runtime.
 */
export const STATUS = {
  paid: {
    marker: '●',
    label: 'Paid',
    className: 'bg-paid-bg text-paid border-paid-line border-l-paid',
  },
  pending: {
    marker: '◐',
    label: 'Pending',
    className: 'bg-pending-bg text-pending border-pending-line border-l-pending',
  },
  partial: {
    marker: '½',
    label: 'Partial',
    className: 'bg-partial-bg text-partial border-partial-line border-l-partial',
  },
  overdue: {
    marker: '▲',
    label: 'Overdue',
    className: 'bg-overdue-bg text-overdue border-overdue-line border-l-overdue',
  },
  failed: {
    marker: '✕',
    label: 'Failed',
    className: 'bg-failed-bg text-failed border-failed-line border-l-failed',
  },
  refunded: {
    marker: '↺',
    label: 'Refunded',
    className: 'bg-refunded-bg text-refunded border-refunded-line border-l-refunded',
  },
  draft: {
    marker: '○',
    label: 'Draft',
    className: 'bg-draft-bg text-draft border-draft-line border-l-draft',
  },
  void: {
    marker: '—',
    label: 'Void',
    className: 'bg-void-bg text-void border-void-line border-l-void',
  },
} as const;

export type StatusKey = keyof typeof STATUS;

/**
 * The database has ten status values across two enums; the design system names
 * seven presentation states. This is the mapping, and it lives here so it
 * exists exactly once.
 *
 * `partial` has its own token (§3.2). It is deliberately NOT `pending`:
 * money has actually arrived, which is a different fact from an invoice merely
 * being in flight, and the two lead to different collection decisions.
 *
 * `sent` still folds into `pending` and `succeeded` into `paid` — both are
 * synonyms of an existing presentation state rather than distinct facts. The
 * labels keep the original word so the UI never misreports the record.
 */
const INVOICE_STATUS_MAP: Record<InvoiceStatus, { key: StatusKey; label: string }> = {
  draft: { key: 'draft', label: 'Draft' },
  sent: { key: 'pending', label: 'Sent' },
  paid: { key: 'paid', label: 'Paid' },
  partial: { key: 'partial', label: 'Partial' },
  overdue: { key: 'overdue', label: 'Overdue' },
  void: { key: 'void', label: 'Void' },
};

const PAYMENT_STATUS_MAP: Record<PaymentStatus, { key: StatusKey; label: string }> = {
  succeeded: { key: 'paid', label: 'Succeeded' },
  pending: { key: 'pending', label: 'Pending' },
  failed: { key: 'failed', label: 'Failed' },
  refunded: { key: 'refunded', label: 'Refunded' },
};

export const invoiceStatusKey = (s: InvoiceStatus) => INVOICE_STATUS_MAP[s];
export const paymentStatusKey = (s: PaymentStatus) => PAYMENT_STATUS_MAP[s];

type Props = {
  status: StatusKey;
  /** Overrides the default label; the marker and colour never change. */
  label?: string;
};

/**
 * §7: radius-xs stamp, 3px left rule in the status foreground, marker glyph,
 * uppercase micro label. Not interactive, so no hover or focus state.
 */
export function StatusBadge({ status, label }: Props) {
  const entry = STATUS[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-xs border border-l-[3px] px-2 py-0.5 text-micro font-medium uppercase whitespace-nowrap ${entry.className}`}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        {entry.marker}
      </span>
      <span className={status === 'void' ? 'line-through' : undefined}>
        {label ?? entry.label}
      </span>
    </span>
  );
}
