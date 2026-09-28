ALTER TABLE "development_developers"
  ADD COLUMN "cover_filename" TEXT,
  ADD COLUMN "cover_mime_type" TEXT,
  ADD COLUMN "cover_size_bytes" INTEGER,
  ADD COLUMN "cover_ready_at" TIMESTAMP(3),
  ADD COLUMN "archived_at" TIMESTAMP(3);

ALTER TABLE "development_projects"
  ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "development_developers_organization_id_archived_at_name_idx"
  ON "development_developers"("organization_id", "archived_at", "name");

CREATE INDEX "development_projects_organization_id_archived_at_updated_at_idx"
  ON "development_projects"("organization_id", "archived_at", "updated_at");
