import { createDatabaseConnection } from "@estate-crm/database";

import { buildApp } from "./app.js";
import { readApiConfig } from "./config.js";
import { startTelegramRuntime } from "./telegram/service.js";

const config = readApiConfig();
const database = createDatabaseConnection(config.databaseUrl);
const app = await buildApp(config, database);
let telegramRuntime: { stop(): void } | undefined;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, "Shutting down API");
  telegramRuntime?.stop();

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, "Failed to shut down API cleanly");
    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await app.listen({ host: config.host, port: config.port });
  telegramRuntime = startTelegramRuntime(config, database, app.log);
} catch (error) {
  app.log.error({ error }, "Failed to start API");
  process.exit(1);
}
