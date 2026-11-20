ALTER TABLE "post_targets" ADD COLUMN "metrics" jsonb;--> statement-breakpoint
ALTER TABLE "post_targets" ADD COLUMN "metrics_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "post_targets_published_idx" ON "post_targets" USING btree ("status","published_at");