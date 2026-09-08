CREATE TYPE "TaskKind" AS ENUM ('CALL', 'MEETING', 'MESSAGE', 'OTHER');
CREATE TYPE "TaskStatus" AS ENUM ('ACTIVE', 'COMPLETED');

CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "TaskKind" NOT NULL DEFAULT 'CALL',
    "status" "TaskStatus" NOT NULL DEFAULT 'ACTIVE',
    "due_date" DATE,
    "due_time" TEXT,
    "result" TEXT,
    "completed_at" TIMESTAMP(3),
    "contact_id" UUID,
    "deal_id" UUID,
    "assignee_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tasks_organization_id_status_due_date_idx" ON "tasks"("organization_id", "status", "due_date");
CREATE INDEX "tasks_contact_id_idx" ON "tasks"("contact_id");
CREATE INDEX "tasks_deal_id_idx" ON "tasks"("deal_id");
CREATE INDEX "tasks_assignee_id_idx" ON "tasks"("assignee_id");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
