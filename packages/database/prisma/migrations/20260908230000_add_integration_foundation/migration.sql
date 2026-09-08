CREATE TYPE "IntegrationProvider" AS ENUM ('TEST', 'META_LEAD_ADS', 'INSTAGRAM_DIRECT', 'TELEPHONY', 'TELEGRAM');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('READY', 'CREDENTIALS_REQUIRED', 'CONNECTED', 'ERROR');
CREATE TYPE "IntegrationEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DUPLICATE', 'FAILED');
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "integration_connections" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'CREDENTIALS_REQUIRED',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "pipeline_id" UUID,
  "stage_id" UUID,
  "config" JSONB,
  "last_event_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "integration_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "connection_id" UUID,
  "provider" "IntegrationProvider" NOT NULL,
  "external_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "IntegrationEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "contact_id" UUID,
  "deal_id" UUID,
  "error" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "integration_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_outbox" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "channel" "IntegrationProvider" NOT NULL DEFAULT 'TELEGRAM',
  "event_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "action_url" TEXT,
  "payload" JSONB,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_connections_organization_id_provider_key" ON "integration_connections"("organization_id", "provider");
CREATE INDEX "integration_connections_organization_id_status_idx" ON "integration_connections"("organization_id", "status");
CREATE UNIQUE INDEX "integration_events_organization_id_provider_external_id_key" ON "integration_events"("organization_id", "provider", "external_id");
CREATE INDEX "integration_events_organization_id_received_at_idx" ON "integration_events"("organization_id", "received_at");
CREATE INDEX "integration_events_deal_id_received_at_idx" ON "integration_events"("deal_id", "received_at");
CREATE INDEX "notification_outbox_organization_id_status_created_at_idx" ON "notification_outbox"("organization_id", "status", "created_at");

ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "integration_events" ADD CONSTRAINT "integration_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
