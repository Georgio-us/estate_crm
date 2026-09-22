CREATE TYPE "DevelopmentConstructionStatus" AS ENUM ('PLANNED', 'UNDER_CONSTRUCTION', 'COMPLETED', 'PAUSED');
CREATE TYPE "DevelopmentSalesStatus" AS ENUM ('EXPECTED', 'LAUNCH', 'OPEN', 'CLOSED');

CREATE TABLE "development_developers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logo_url" TEXT,
    "source_url" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "development_developers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "development_projects" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "developer_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "description" TEXT,
    "construction_status" "DevelopmentConstructionStatus" NOT NULL DEFAULT 'PLANNED',
    "sales_status" "DevelopmentSalesStatus" NOT NULL DEFAULT 'EXPECTED',
    "planned_completion" TEXT,
    "class_name" TEXT,
    "buildings_count" INTEGER,
    "sections_count" INTEGER,
    "floors" TEXT,
    "image_url" TEXT,
    "source_url" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "development_projects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "development_developers_organization_id_slug_key" ON "development_developers"("organization_id", "slug");
CREATE INDEX "development_developers_organization_id_name_idx" ON "development_developers"("organization_id", "name");
CREATE UNIQUE INDEX "development_projects_developer_id_slug_key" ON "development_projects"("developer_id", "slug");
CREATE INDEX "development_projects_organization_id_construction_status_sales_status_idx" ON "development_projects"("organization_id", "construction_status", "sales_status");
CREATE INDEX "development_projects_developer_id_name_idx" ON "development_projects"("developer_id", "name");

ALTER TABLE "development_developers" ADD CONSTRAINT "development_developers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "development_projects" ADD CONSTRAINT "development_projects_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "development_developers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
