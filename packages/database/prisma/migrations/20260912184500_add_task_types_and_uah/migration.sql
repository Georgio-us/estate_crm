ALTER TYPE "Currency" ADD VALUE 'UAH';

CREATE TABLE "task_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_kind" "TaskKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_types_organization_id_key_key" ON "task_types"("organization_id", "key");
CREATE INDEX "task_types_organization_id_position_idx" ON "task_types"("organization_id", "position");

ALTER TABLE "task_types" ADD CONSTRAINT "task_types_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "task_types" ("id", "organization_id", "key", "name", "base_kind", "position")
SELECT gen_random_uuid(), organization."id", defaults."key", defaults."name", defaults."base_kind"::"TaskKind", defaults."position"
FROM "organizations" organization
CROSS JOIN (VALUES
  ('call', 'Звонок', 'CALL', 0),
  ('meeting', 'Встреча', 'MEETING', 1),
  ('message', 'Сообщение', 'MESSAGE', 2),
  ('showing', 'Показ объекта', 'MEETING', 3),
  ('other', 'Другое', 'OTHER', 4)
) AS defaults("key", "name", "base_kind", "position");

ALTER TABLE "tasks" ADD COLUMN "task_type_id" UUID;

UPDATE "tasks" task
SET "task_type_id" = task_type."id"
FROM "task_types" task_type
WHERE task_type."organization_id" = task."organization_id"
  AND task_type."key" = CASE task."kind"
    WHEN 'CALL' THEN 'call'
    WHEN 'MEETING' THEN 'meeting'
    WHEN 'MESSAGE' THEN 'message'
    ELSE 'other'
  END;

CREATE INDEX "tasks_task_type_id_idx" ON "tasks"("task_type_id");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_task_type_id_fkey"
  FOREIGN KEY ("task_type_id") REFERENCES "task_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
