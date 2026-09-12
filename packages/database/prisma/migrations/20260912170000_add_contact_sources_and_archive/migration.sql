ALTER TYPE "ContactSource" ADD VALUE 'CALL';
ALTER TYPE "ContactSource" ADD VALUE 'REFERRAL';

CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "contacts"
  ADD COLUMN "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "archived_at" TIMESTAMP(3);

DROP INDEX "contacts_organization_id_created_at_idx";
CREATE INDEX "contacts_organization_id_status_created_at_idx" ON "contacts"("organization_id", "status", "created_at");
