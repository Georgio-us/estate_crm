CREATE TYPE "ContactSource" AS ENUM ('META', 'WEBSITE', 'MANUAL');

CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "normalized_phone" TEXT,
    "email" TEXT,
    "telegram" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'MANUAL',
    "assignee_id" UUID,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contacts_organization_id_created_at_idx" ON "contacts"("organization_id", "created_at");
CREATE INDEX "contacts_organization_id_normalized_phone_idx" ON "contacts"("organization_id", "normalized_phone");
CREATE INDEX "contacts_assignee_id_idx" ON "contacts"("assignee_id");

ALTER TABLE "contacts"
ADD CONSTRAINT "contacts_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contacts"
ADD CONSTRAINT "contacts_assignee_id_fkey"
FOREIGN KEY ("assignee_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
