CREATE TYPE "DevelopmentAssetKind" AS ENUM ('COVER', 'GALLERY', 'CHESSBOARD', 'PRICE_LIST', 'LAYOUT', 'PROMOTION', 'PRESENTATION', 'PERMIT', 'OTHER');
CREATE TYPE "DevelopmentAssetStatus" AS ENUM ('PENDING', 'READY', 'PROCESSING', 'REVIEW_REQUIRED', 'FAILED');
CREATE TYPE "DevelopmentImportStatus" AS ENUM ('DRAFT', 'PROCESSING', 'REVIEW_REQUIRED', 'PUBLISHED', 'FAILED');
CREATE TYPE "DevelopmentUnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'UNKNOWN');

CREATE TABLE "development_assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "uploaded_by_id" UUID,
    "storage_key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "kind" "DevelopmentAssetKind" NOT NULL,
    "status" "DevelopmentAssetStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_cover" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "extraction" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ready_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "development_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "development_buildings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "development_buildings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "development_sections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "building_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "development_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "development_units" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "building_id" UUID,
    "section_id" UUID,
    "unit_number" TEXT NOT NULL,
    "floor" INTEGER,
    "rooms" INTEGER,
    "area" DOUBLE PRECISION,
    "price" INTEGER,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "status" "DevelopmentUnitStatus" NOT NULL DEFAULT 'UNKNOWN',
    "layout_asset_id" UUID,
    "source_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "development_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "development_import_batches" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "status" "DevelopmentImportStatus" NOT NULL DEFAULT 'DRAFT',
    "parser_key" TEXT,
    "summary" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    CONSTRAINT "development_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "development_import_rows" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "mapped_data" JSONB,
    "confidence" DOUBLE PRECISION,
    "issues" JSONB,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "development_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "development_assets_storage_key_key" ON "development_assets"("storage_key");
CREATE INDEX "development_assets_organization_id_project_id_kind_status_idx" ON "development_assets"("organization_id", "project_id", "kind", "status");
CREATE UNIQUE INDEX "development_buildings_project_id_name_key" ON "development_buildings"("project_id", "name");
CREATE INDEX "development_buildings_organization_id_project_id_position_idx" ON "development_buildings"("organization_id", "project_id", "position");
CREATE UNIQUE INDEX "development_sections_building_id_name_key" ON "development_sections"("building_id", "name");
CREATE INDEX "development_sections_organization_id_building_id_position_idx" ON "development_sections"("organization_id", "building_id", "position");
CREATE UNIQUE INDEX "development_units_project_id_building_id_section_id_unit_number_key" ON "development_units"("project_id", "building_id", "section_id", "unit_number");
CREATE INDEX "development_units_organization_id_project_id_status_floor_idx" ON "development_units"("organization_id", "project_id", "status", "floor");
CREATE UNIQUE INDEX "development_import_batches_asset_id_key" ON "development_import_batches"("asset_id");
CREATE INDEX "development_import_batches_organization_id_project_id_status_idx" ON "development_import_batches"("organization_id", "project_id", "status");
CREATE UNIQUE INDEX "development_import_rows_batch_id_row_number_key" ON "development_import_rows"("batch_id", "row_number");
CREATE INDEX "development_import_rows_organization_id_batch_id_approved_idx" ON "development_import_rows"("organization_id", "batch_id", "approved");

ALTER TABLE "development_assets" ADD CONSTRAINT "development_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_assets" ADD CONSTRAINT "development_assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "development_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_assets" ADD CONSTRAINT "development_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "development_buildings" ADD CONSTRAINT "development_buildings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_buildings" ADD CONSTRAINT "development_buildings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "development_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_sections" ADD CONSTRAINT "development_sections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_sections" ADD CONSTRAINT "development_sections_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "development_buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_units" ADD CONSTRAINT "development_units_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_units" ADD CONSTRAINT "development_units_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "development_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_units" ADD CONSTRAINT "development_units_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "development_buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "development_units" ADD CONSTRAINT "development_units_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "development_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "development_import_batches" ADD CONSTRAINT "development_import_batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_import_batches" ADD CONSTRAINT "development_import_batches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "development_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_import_batches" ADD CONSTRAINT "development_import_batches_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "development_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_import_rows" ADD CONSTRAINT "development_import_rows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_import_rows" ADD CONSTRAINT "development_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "development_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
