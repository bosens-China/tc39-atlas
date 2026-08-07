CREATE TYPE "public"."proposal_change_kind" AS ENUM('added', 'stage_changed', 'finished', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('active', 'finished', 'inactive');--> statement-breakpoint
CREATE TABLE "proposal_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"kind" "proposal_change_kind" NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"stage" numeric(2, 1),
	"edition" integer,
	"status" "proposal_status" NOT NULL,
	"repository_url" text NOT NULL,
	"readme" text NOT NULL,
	"readme_hash" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_changes" ADD CONSTRAINT "proposal_changes_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_changes_proposal_idx" ON "proposal_changes" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "proposal_changes_occurred_idx" ON "proposal_changes" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "proposals_stage_idx" ON "proposals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "proposals_edition_idx" ON "proposals" USING btree ("edition");--> statement-breakpoint
CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("status");