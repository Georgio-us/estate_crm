CREATE TABLE "pilot_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "device" TEXT,
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pilot_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pilot_events_organization_id_created_at_idx" ON "pilot_events"("organization_id", "created_at");
CREATE INDEX "pilot_events_organization_id_kind_created_at_idx" ON "pilot_events"("organization_id", "kind", "created_at");
CREATE INDEX "pilot_events_user_id_created_at_idx" ON "pilot_events"("user_id", "created_at");

ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pilot_events" ADD CONSTRAINT "pilot_events_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
