ALTER TABLE "organizations"
  ADD COLUMN "company_name" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "currency" "Currency" NOT NULL DEFAULT 'USD';

UPDATE "organizations" SET "company_name" = "name" WHERE "company_name" IS NULL;

ALTER TABLE "sessions"
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
