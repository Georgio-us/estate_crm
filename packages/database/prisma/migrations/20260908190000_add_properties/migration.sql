CREATE TYPE "PropertyCategory" AS ENUM ('APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL');
CREATE TYPE "PropertyMarket" AS ENUM ('PRIMARY', 'SECONDARY');
CREATE TYPE "PropertyOperation" AS ENUM ('SALE', 'RENT');
CREATE TYPE "PropertyStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD');
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR');

CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "address" TEXT,
    "district" TEXT,
    "category" "PropertyCategory" NOT NULL,
    "market" "PropertyMarket" NOT NULL,
    "operation" "PropertyOperation" NOT NULL DEFAULT 'SALE',
    "status" "PropertyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "rooms" TEXT,
    "area" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "floor" INTEGER,
    "total_floors" INTEGER,
    "land_area" DOUBLE PRECISION,
    "project" TEXT,
    "developer" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "properties_organization_id_number_key" ON "properties"("organization_id", "number");
CREATE INDEX "properties_organization_id_status_updated_at_idx" ON "properties"("organization_id", "status", "updated_at");

ALTER TABLE "properties" ADD CONSTRAINT "properties_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
