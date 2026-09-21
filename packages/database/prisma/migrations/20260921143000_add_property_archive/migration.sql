ALTER TABLE "properties"
  ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "properties_organization_id_archived_at_updated_at_idx"
  ON "properties"("organization_id", "archived_at", "updated_at");
