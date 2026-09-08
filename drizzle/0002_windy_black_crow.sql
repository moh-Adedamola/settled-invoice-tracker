-- ===========================================================================
-- NO BACKFILL, deliberately.
--
-- Existing invoices get no line items. Synthesising one from `description` and
-- `amount_minor` would invent an itemisation that was never on the document,
-- with a quantity and a unit price nobody ever quoted. On demo data that is
-- merely untidy; on the real invoices this migration will eventually run
-- against, it is falsifying a financial record.
--
-- Nothing breaks: every query reads invoices.amount_minor, which is untouched,
-- and the consistency trigger below exempts invoices with zero line items. The
-- demo set picks up real line items on the next `npm run seed`.
--
-- The UI must therefore render an invoice with no line items — falling back to
-- its description and total. That is the correct presentation for a legacy
-- document anyway.
-- ===========================================================================
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"line_amount_minor" bigint NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_items_invoice_position_key" UNIQUE("invoice_id","position")
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
-- ===========================================================================
-- Invoice total <-> line item consistency
-- ===========================================================================
--
-- invoices.amount_minor stays the authoritative, stored total: an invoice is a
-- document, and its total is what was actually sent to the client. Deriving it
-- would mean editing a line item silently rewrites an invoice already in
-- someone's inbox, and would make an invoice with no line items total zero.
--
-- What stops the stored total drifting from its lines is this constraint,
-- enforced by the database rather than by application discipline:
--
--   IF an invoice has at least one line item,
--   THEN sum(line_amount_minor) MUST equal invoices.amount_minor.
--
-- Invoices with NO line items are explicitly allowed. That covers every
-- invoice that predates this table (which this migration deliberately does not
-- backfill) and any draft that has not been itemised yet.
--
-- The trigger is a CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED, so it
-- fires at COMMIT rather than per row. Inside a transaction the lines and the
-- total can be written in any order; only the final state is checked.
--
-- Consequence worth knowing: neon-http gives each statement its own implicit
-- transaction. Any change to a line item must therefore either be a single
-- statement that also fixes the total, or run over a connection that supports
-- an explicit transaction. Adding one line to an existing invoice as a bare
-- INSERT will be rejected — correctly, because on its own it makes the invoice
-- disagree with itself.
CREATE OR REPLACE FUNCTION settled_check_invoice_total() RETURNS trigger AS $$
DECLARE
  v_invoice_id uuid;
  v_total      bigint;
  v_sum        bigint;
  v_count      integer;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    v_invoice_id := NEW.id;
  ELSE
    v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  END IF;

  -- The invoice may already be gone: deleting one cascades to its line items,
  -- and the deferred check then runs after both are removed.
  SELECT amount_minor INTO v_total FROM invoices WHERE id = v_invoice_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(line_amount_minor), 0), COUNT(*)
    INTO v_sum, v_count
    FROM invoice_line_items
   WHERE invoice_id = v_invoice_id;

  IF v_count > 0 AND v_sum <> v_total THEN
    RAISE EXCEPTION
      'invoice % total (%) does not match the sum of its % line item(s) (%)',
      v_invoice_id, v_total, v_count, v_sum
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE CONSTRAINT TRIGGER invoice_line_items_total_check
  AFTER INSERT OR UPDATE OR DELETE ON invoice_line_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settled_check_invoice_total();--> statement-breakpoint

CREATE CONSTRAINT TRIGGER invoices_total_check
  AFTER UPDATE OF amount_minor ON invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settled_check_invoice_total();
