CREATE TYPE "public"."email_kind" AS ENUM('receipt', 'reminder');--> statement-breakpoint
CREATE TABLE "sent_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "email_kind" NOT NULL,
	"invoice_id" uuid NOT NULL,
	"payment_id" uuid,
	"recipient" text NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sent_emails_receipt_once" ON "sent_emails" USING btree ("payment_id") WHERE "sent_emails"."kind" = 'receipt' and "sent_emails"."error" is null;--> statement-breakpoint
CREATE INDEX "sent_emails_invoice_id_idx" ON "sent_emails" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "sent_emails_sent_at_idx" ON "sent_emails" USING btree ("sent_at");