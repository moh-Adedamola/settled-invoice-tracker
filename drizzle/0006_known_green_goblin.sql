CREATE TYPE "public"."telegram_alert_kind" AS ENUM('payment_succeeded', 'payment_failed', 'processing_failure');--> statement-breakpoint
CREATE TABLE "telegram_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "telegram_alert_kind" NOT NULL,
	"payment_id" uuid,
	"webhook_event_id" uuid,
	"chat_id" text NOT NULL,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "telegram_alerts_one_subject" CHECK (("telegram_alerts"."payment_id" is null) <> ("telegram_alerts"."webhook_event_id" is null))
);
--> statement-breakpoint
ALTER TABLE "telegram_alerts" ADD CONSTRAINT "telegram_alerts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_alerts" ADD CONSTRAINT "telegram_alerts_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_alerts_payment_once" ON "telegram_alerts" USING btree ("payment_id") WHERE "telegram_alerts"."payment_id" is not null and "telegram_alerts"."error" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_alerts_event_once" ON "telegram_alerts" USING btree ("webhook_event_id") WHERE "telegram_alerts"."webhook_event_id" is not null and "telegram_alerts"."error" is null;--> statement-breakpoint
CREATE INDEX "telegram_alerts_sent_at_idx" ON "telegram_alerts" USING btree ("sent_at");