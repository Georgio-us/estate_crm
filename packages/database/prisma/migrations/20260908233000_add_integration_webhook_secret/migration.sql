ALTER TABLE "integration_connections"
ADD COLUMN "webhook_secret_hash" TEXT;

CREATE UNIQUE INDEX "integration_connections_webhook_secret_hash_key"
ON "integration_connections"("webhook_secret_hash");
