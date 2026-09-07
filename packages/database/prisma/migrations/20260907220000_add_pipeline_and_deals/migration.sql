CREATE TYPE "DealOperation" AS ENUM ('PURCHASE', 'RENT', 'SALE');

CREATE TABLE "pipelines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pipeline_stages" (
    "id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "organization_id" UUID NOT NULL,
    "pipeline_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "assignee_id" UUID,
    "request" TEXT NOT NULL,
    "budget" TEXT,
    "operation" "DealOperation" NOT NULL DEFAULT 'PURCHASE',
    "property_type" TEXT,
    "district" TEXT,
    "rooms" TEXT,
    "source" "ContactSource" NOT NULL DEFAULT 'MANUAL',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

ALTER SEQUENCE "deals_number_seq" RESTART WITH 1001;

CREATE INDEX "pipelines_organization_id_idx" ON "pipelines"("organization_id");
CREATE UNIQUE INDEX "pipeline_stages_pipeline_id_position_key" ON "pipeline_stages"("pipeline_id", "position");
CREATE INDEX "pipeline_stages_pipeline_id_idx" ON "pipeline_stages"("pipeline_id");
CREATE UNIQUE INDEX "deals_organization_id_number_key" ON "deals"("organization_id", "number");
CREATE INDEX "deals_pipeline_id_stage_id_position_idx" ON "deals"("pipeline_id", "stage_id", "position");
CREATE INDEX "deals_contact_id_idx" ON "deals"("contact_id");
CREATE INDEX "deals_assignee_id_idx" ON "deals"("assignee_id");

ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "pipelines" ("id", "organization_id", "name", "is_default", "updated_at")
SELECT gen_random_uuid(), "id", 'Продажа недвижимости', true, CURRENT_TIMESTAMP
FROM "organizations";

INSERT INTO "pipeline_stages" ("id", "pipeline_id", "title", "color", "position", "updated_at")
SELECT gen_random_uuid(), p."id", stage."title", stage."color", stage."position", CURRENT_TIMESTAMP
FROM "pipelines" p
CROSS JOIN (VALUES
    ('Неразобранные', '#d6a835', 0),
    ('Новый лид', '#d98245', 1),
    ('Не дозвонились', '#5d8fc9', 2),
    ('В работе', '#8b6cc2', 3),
    ('Подбор объектов', '#4a9d75', 4)
) AS stage("title", "color", "position")
WHERE p."is_default" = true;
