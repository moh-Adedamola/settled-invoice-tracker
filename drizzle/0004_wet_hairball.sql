CREATE TABLE "app_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"business_name" text DEFAULT 'Settled' NOT NULL,
	"business_address" text DEFAULT '' NOT NULL,
	"business_email" text DEFAULT '' NOT NULL,
	"business_phone" text DEFAULT '' NOT NULL,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"reminder_day_1" integer DEFAULT 3 NOT NULL,
	"reminder_day_2" integer DEFAULT 7 NOT NULL,
	"reminder_day_3" integer DEFAULT 14 NOT NULL,
	"telegram_chat_id" text DEFAULT '' NOT NULL,
	"alert_on_payment_success" boolean DEFAULT false NOT NULL,
	"alert_on_payment_failure" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id"),
	CONSTRAINT "app_settings_reminder_ladder_ascending" CHECK ("app_settings"."reminder_day_1" < "app_settings"."reminder_day_2" and "app_settings"."reminder_day_2" < "app_settings"."reminder_day_3"),
	CONSTRAINT "app_settings_reminder_days_positive" CHECK ("app_settings"."reminder_day_1" >= 1),
	CONSTRAINT "app_settings_reminder_days_bounded" CHECK ("app_settings"."reminder_day_3" <= 365)
);
--> statement-breakpoint
-- The singleton row, created here so every read after this migration finds one.
-- Column defaults supply the values, so the defaults are defined in exactly one
-- place; `ON CONFLICT DO NOTHING` keeps a re-run harmless.
INSERT INTO "app_settings" ("id") VALUES (true) ON CONFLICT ("id") DO NOTHING;
