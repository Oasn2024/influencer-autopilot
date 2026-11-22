CREATE TYPE "public"."autopilot_writer" AS ENUM('app', 'agent');--> statement-breakpoint
ALTER TYPE "public"."post_source" ADD VALUE 'agent';--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"secret_enc" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_status" integer,
	"last_error" text,
	"last_delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autopilot_settings" ADD COLUMN "writer" "autopilot_writer" DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "autopilot_settings" ADD COLUMN "agent_notified_key" text;--> statement-breakpoint
ALTER TABLE "autopilot_settings" ADD COLUMN "agent_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhooks_user_idx" ON "webhooks" USING btree ("user_id");