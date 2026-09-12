CREATE TYPE "DealMarketPreference" AS ENUM ('PRIMARY', 'SECONDARY');
CREATE TYPE "DealPaymentMethod" AS ENUM ('FULL', 'INSTALLMENT');
CREATE TYPE "DealPropertySelectionStatus" AS ENUM ('CANDIDATE', 'OFFERED');

ALTER TABLE "deals"
  ADD COLUMN "market_preference" "DealMarketPreference",
  ADD COLUMN "payment_method" "DealPaymentMethod",
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "preferred_project" TEXT;

CREATE TABLE "deal_property_selections" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "property_id" UUID,
  "catalog_key" TEXT NOT NULL,
  "status" "DealPropertySelectionStatus" NOT NULL DEFAULT 'CANDIDATE',
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "price_label" TEXT,
  "image_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deal_property_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deal_property_selections_deal_id_catalog_key_key" ON "deal_property_selections"("deal_id", "catalog_key");
CREATE INDEX "deal_property_selections_organization_id_status_idx" ON "deal_property_selections"("organization_id", "status");
CREATE INDEX "deal_property_selections_property_id_idx" ON "deal_property_selections"("property_id");

ALTER TABLE "deal_property_selections" ADD CONSTRAINT "deal_property_selections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_property_selections" ADD CONSTRAINT "deal_property_selections_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deal_property_selections" ADD CONSTRAINT "deal_property_selections_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
