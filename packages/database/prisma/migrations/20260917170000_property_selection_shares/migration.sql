CREATE TYPE "PropertySelectionShareStatus" AS ENUM ('CREATED', 'SENT', 'OPENED', 'REVOKED');
CREATE TYPE "PropertySelectionSource" AS ENUM ('CRM', 'VIA', 'DEMO');

CREATE TABLE "property_selection_shares" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "contact_id" UUID,
  "created_by_id" UUID,
  "public_token" TEXT NOT NULL,
  "status" "PropertySelectionShareStatus" NOT NULL DEFAULT 'CREATED',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "sent_at" TIMESTAMP(3),
  "opened_at" TIMESTAMP(3),
  "last_viewed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "property_selection_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_selection_share_items" (
  "id" UUID NOT NULL,
  "share_id" UUID NOT NULL,
  "property_selection_id" UUID,
  "property_id" UUID,
  "source" "PropertySelectionSource" NOT NULL DEFAULT 'CRM',
  "external_id" TEXT,
  "title" TEXT NOT NULL,
  "subtitle" TEXT,
  "price_label" TEXT,
  "image_url" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "property_selection_share_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "property_selection_shares_public_token_key" ON "property_selection_shares"("public_token");
CREATE INDEX "property_selection_shares_organization_id_deal_id_created_at_idx" ON "property_selection_shares"("organization_id", "deal_id", "created_at");
CREATE INDEX "property_selection_shares_status_expires_at_idx" ON "property_selection_shares"("status", "expires_at");
CREATE INDEX "property_selection_share_items_share_id_sort_order_idx" ON "property_selection_share_items"("share_id", "sort_order");
CREATE INDEX "property_selection_share_items_property_selection_id_idx" ON "property_selection_share_items"("property_selection_id");
CREATE INDEX "property_selection_share_items_property_id_idx" ON "property_selection_share_items"("property_id");

ALTER TABLE "property_selection_shares" ADD CONSTRAINT "property_selection_shares_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_selection_shares" ADD CONSTRAINT "property_selection_shares_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_selection_shares" ADD CONSTRAINT "property_selection_shares_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_selection_shares" ADD CONSTRAINT "property_selection_shares_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_selection_share_items" ADD CONSTRAINT "property_selection_share_items_share_id_fkey" FOREIGN KEY ("share_id") REFERENCES "property_selection_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_selection_share_items" ADD CONSTRAINT "property_selection_share_items_property_selection_id_fkey" FOREIGN KEY ("property_selection_id") REFERENCES "deal_property_selections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_selection_share_items" ADD CONSTRAINT "property_selection_share_items_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
