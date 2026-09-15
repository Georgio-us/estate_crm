ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'VIA';

CREATE TYPE "ViaSharedSelectionStatus" AS ENUM ('DRAFT', 'CREATED', 'SENT', 'REVOKED', 'FAILED');

ALTER TABLE "integration_connections" ADD COLUMN "credential_ciphertext" TEXT;

CREATE TABLE "via_pairings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "issued_by_id" UUID,
  "code_hash" TEXT NOT NULL,
  "via_tenant" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "claimed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "via_pairings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "via_pairings_code_hash_key" ON "via_pairings"("code_hash");
CREATE INDEX "via_pairings_organization_id_expires_at_idx" ON "via_pairings"("organization_id", "expires_at");
ALTER TABLE "via_pairings" ADD CONSTRAINT "via_pairings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "via_pairings" ADD CONSTRAINT "via_pairings_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "via_shared_selections" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "deal_id" UUID NOT NULL,
  "contact_id" UUID,
  "context_id" UUID NOT NULL,
  "via_selection_id" TEXT NOT NULL,
  "share_url" TEXT NOT NULL,
  "property_external_ids" JSONB NOT NULL,
  "status" "ViaSharedSelectionStatus" NOT NULL DEFAULT 'CREATED',
  "created_by_id" UUID,
  "sent_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "via_shared_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "via_shared_selections_context_id_key" ON "via_shared_selections"("context_id");
CREATE UNIQUE INDEX "via_shared_selections_organization_id_via_selection_id_key" ON "via_shared_selections"("organization_id", "via_selection_id");
CREATE INDEX "via_shared_selections_deal_id_created_at_idx" ON "via_shared_selections"("deal_id", "created_at");
ALTER TABLE "via_shared_selections" ADD CONSTRAINT "via_shared_selections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "via_shared_selections" ADD CONSTRAINT "via_shared_selections_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "via_shared_selections" ADD CONSTRAINT "via_shared_selections_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "via_shared_selections" ADD CONSTRAINT "via_shared_selections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
