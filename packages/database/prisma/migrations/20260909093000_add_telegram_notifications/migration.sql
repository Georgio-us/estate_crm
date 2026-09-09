CREATE TYPE "TelegramRecipientScope" AS ENUM ('ORGANIZATION', 'OWN');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "telegram_recipients" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "chat_id" TEXT NOT NULL,
  "username" TEXT,
  "first_name" TEXT,
  "scope" "TelegramRecipientScope" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_connect_tokens" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "scope" "TelegramRecipientScope" NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_connect_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3),
  "last_error" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_recipients_organization_id_user_id_key" ON "telegram_recipients"("organization_id", "user_id");
CREATE UNIQUE INDEX "telegram_recipients_organization_id_chat_id_key" ON "telegram_recipients"("organization_id", "chat_id");
CREATE INDEX "telegram_recipients_organization_id_active_idx" ON "telegram_recipients"("organization_id", "active");
CREATE UNIQUE INDEX "telegram_connect_tokens_token_hash_key" ON "telegram_connect_tokens"("token_hash");
CREATE INDEX "telegram_connect_tokens_expires_at_used_at_idx" ON "telegram_connect_tokens"("expires_at", "used_at");
CREATE UNIQUE INDEX "notification_deliveries_notification_id_recipient_id_key" ON "notification_deliveries"("notification_id", "recipient_id");
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status", "next_attempt_at");

ALTER TABLE "telegram_recipients" ADD CONSTRAINT "telegram_recipients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_recipients" ADD CONSTRAINT "telegram_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_connect_tokens" ADD CONSTRAINT "telegram_connect_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_connect_tokens" ADD CONSTRAINT "telegram_connect_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "telegram_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
