ALTER TABLE "proposals" ADD COLUMN "readme_zh" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "readme_zh_source_hash" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "translation_policy_version" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "translation_model" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "translated_at" timestamp with time zone;