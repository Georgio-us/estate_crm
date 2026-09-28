ALTER TABLE "development_projects"
  ADD COLUMN "construction_technology" TEXT,
  ADD COLUMN "heating" TEXT,
  ADD COLUMN "territory" TEXT,
  ADD COLUMN "parking" TEXT,
  ADD COLUMN "apartment_condition" TEXT,
  ADD COLUMN "ceiling_height" TEXT,
  ADD COLUMN "installment_terms" TEXT,
  ADD COLUMN "down_payment" TEXT,
  ADD COLUMN "infrastructure" TEXT,
  ADD COLUMN "manager_note" TEXT;

ALTER TABLE "organizations"
  ADD COLUMN "managers_see_all_deals" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "managers_see_unassigned_phones" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "managers_can_claim_unassigned" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "managers_can_manage_developments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "managers_can_export" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "development_units"
  ADD COLUMN "manual_fields" JSONB,
  ADD COLUMN "manual_updated_at" TIMESTAMP(3),
  ADD COLUMN "archived_at" TIMESTAMP(3);

ALTER TABLE "users"
  ADD COLUMN "avatar_storage_key" TEXT,
  ADD COLUMN "avatar_mime_type" TEXT,
  ADD COLUMN "avatar_size_bytes" INTEGER,
  ADD COLUMN "avatar_ready_at" TIMESTAMP(3);

ALTER TABLE "deals" ADD COLUMN "loss_reason" TEXT;

CREATE TYPE "OrganizationReferenceKind" AS ENUM ('LEAD_SOURCE', 'DISTRICT', 'PROPERTY_TYPE', 'LOSS_REASON');

CREATE TABLE "organization_references" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "kind" "OrganizationReferenceKind" NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_references_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_references_organization_id_kind_key_key" ON "organization_references"("organization_id", "kind", "key");
CREATE INDEX "organization_references_organization_id_kind_is_active_position_idx" ON "organization_references"("organization_id", "kind", "is_active", "position");
ALTER TABLE "organization_references" ADD CONSTRAINT "organization_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "development_unit_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "actor_id" UUID,
  "title" TEXT NOT NULL,
  "changes" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "development_unit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "development_units_organization_id_project_id_archived_at_idx" ON "development_units"("organization_id", "project_id", "archived_at");
CREATE INDEX "development_unit_events_organization_id_unit_id_created_at_idx" ON "development_unit_events"("organization_id", "unit_id", "created_at");

ALTER TABLE "development_unit_events" ADD CONSTRAINT "development_unit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_unit_events" ADD CONSTRAINT "development_unit_events_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "development_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_unit_events" ADD CONSTRAINT "development_unit_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
