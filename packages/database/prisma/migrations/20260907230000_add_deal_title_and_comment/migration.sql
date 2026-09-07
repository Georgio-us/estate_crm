ALTER TABLE "deals" ADD COLUMN "title" TEXT;
ALTER TABLE "deals" ADD COLUMN "comment" TEXT;

UPDATE "deals" SET "title" = "request" WHERE "title" IS NULL;

ALTER TABLE "deals" ALTER COLUMN "title" SET NOT NULL;
