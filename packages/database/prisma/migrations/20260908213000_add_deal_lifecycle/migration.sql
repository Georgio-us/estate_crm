CREATE TYPE "DealStatus" AS ENUM ('ACTIVE', 'WON', 'LOST', 'ARCHIVED');

ALTER TABLE "deals"
ADD COLUMN "status" "DealStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "closed_at" TIMESTAMP(3);

DROP INDEX "deals_pipeline_id_stage_id_position_idx";
CREATE INDEX "deals_pipeline_id_status_stage_id_position_idx" ON "deals"("pipeline_id", "status", "stage_id", "position");
