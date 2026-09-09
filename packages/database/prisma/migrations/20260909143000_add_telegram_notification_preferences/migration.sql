CREATE TYPE "TelegramNotificationAudience" AS ENUM ('ALL', 'OWN', 'SELECTED', 'NONE');

ALTER TABLE "notification_outbox" ADD COLUMN "dedupe_key" TEXT;

ALTER TABLE "telegram_recipients"
  ADD COLUMN "audience" "TelegramNotificationAudience" NOT NULL DEFAULT 'OWN',
  ADD COLUMN "lead_notifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "task_reminder_notifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "task_overdue_notifications" BOOLEAN NOT NULL DEFAULT true;

UPDATE "telegram_recipients"
SET "audience" = CASE WHEN "scope" = 'ORGANIZATION' THEN 'ALL'::"TelegramNotificationAudience" ELSE 'OWN'::"TelegramNotificationAudience" END;

CREATE TABLE "telegram_recipient_selections" (
  "id" UUID NOT NULL,
  "recipient_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  CONSTRAINT "telegram_recipient_selections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_outbox_organization_id_channel_dedupe_key_key"
  ON "notification_outbox"("organization_id", "channel", "dedupe_key");
CREATE UNIQUE INDEX "telegram_recipient_selections_recipient_id_user_id_key"
  ON "telegram_recipient_selections"("recipient_id", "user_id");
CREATE INDEX "telegram_recipient_selections_user_id_idx"
  ON "telegram_recipient_selections"("user_id");

ALTER TABLE "telegram_recipient_selections"
  ADD CONSTRAINT "telegram_recipient_selections_recipient_id_fkey"
  FOREIGN KEY ("recipient_id") REFERENCES "telegram_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_recipient_selections"
  ADD CONSTRAINT "telegram_recipient_selections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
