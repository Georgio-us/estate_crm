CREATE TYPE "PropertyPhotoStatus" AS ENUM ('PENDING', 'READY');

ALTER TABLE "properties" ALTER COLUMN "price" DROP DEFAULT;
ALTER TABLE "properties" ALTER COLUMN "price" DROP NOT NULL;
ALTER TABLE "properties" ALTER COLUMN "area" DROP DEFAULT;
ALTER TABLE "properties" ALTER COLUMN "area" DROP NOT NULL;
ALTER TABLE "properties" ADD COLUMN "building_label" TEXT;
ALTER TABLE "properties" ADD COLUMN "price_raw" TEXT;
ALTER TABLE "properties" ADD COLUMN "area_raw" TEXT;
ALTER TABLE "properties" ADD COLUMN "unit_detail" TEXT;
ALTER TABLE "properties" ADD COLUMN "subtype" TEXT;
ALTER TABLE "properties" ADD COLUMN "condition" TEXT;
ALTER TABLE "properties" ADD COLUMN "document_notes" TEXT;
ALTER TABLE "properties" ADD COLUMN "owner_name" TEXT;
ALTER TABLE "properties" ADD COLUMN "owner_contacts" TEXT;
ALTER TABLE "properties" ADD COLUMN "assignee_id" UUID;
ALTER TABLE "properties" ADD COLUMN "assignment_note" TEXT;
ALTER TABLE "properties" ADD COLUMN "source_sheet" TEXT;
ALTER TABLE "properties" ADD COLUMN "source_row" INTEGER;
ALTER TABLE "properties" ADD COLUMN "source_hash" TEXT;
ALTER TABLE "properties" ADD COLUMN "source_raw" JSONB;
ALTER TABLE "properties" ADD COLUMN "imported_at" TIMESTAMP(3);

CREATE INDEX "properties_organization_id_market_category_idx" ON "properties"("organization_id", "market", "category");
CREATE INDEX "properties_organization_id_assignee_id_idx" ON "properties"("organization_id", "assignee_id");
CREATE UNIQUE INDEX "properties_organization_id_source_hash_key" ON "properties"("organization_id", "source_hash");
ALTER TABLE "properties" ADD CONSTRAINT "properties_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "property_photos" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "uploaded_by_id" UUID,
  "storage_key" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "status" "PropertyPhotoStatus" NOT NULL DEFAULT 'PENDING',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_cover" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ready_at" TIMESTAMP(3),
  CONSTRAINT "property_photos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "property_photos_storage_key_key" ON "property_photos"("storage_key");
CREATE INDEX "property_photos_organization_id_property_id_status_sort_order_idx" ON "property_photos"("organization_id", "property_id", "status", "sort_order");
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_photos" ADD CONSTRAINT "property_photos_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "property_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "property_id" UUID NOT NULL,
  "actor_id" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "property_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "property_events_organization_id_property_id_created_at_idx" ON "property_events"("organization_id", "property_id", "created_at");
ALTER TABLE "property_events" ADD CONSTRAINT "property_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_events" ADD CONSTRAINT "property_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_events" ADD CONSTRAINT "property_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
