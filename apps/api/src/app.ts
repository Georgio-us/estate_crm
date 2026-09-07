import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";

import type { HealthErrorResponse, HealthResponse } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "./config.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerContactRoutes } from "./contacts/routes.js";
import { registerPipelineRoutes } from "./pipeline/routes.js";

export async function buildApp(
  config: ApiConfig,
  database: DatabaseConnection,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.webOrigins,
    credentials: true,
  });

  await app.register(cookie);

  app.addHook("onClose", async () => {
    await database.disconnect();
  });

  app.get<{ Reply: HealthResponse | HealthErrorResponse }>("/health", async (_request, reply) => {
    try {
      await database.ping();

      return {
        status: "ok",
        service: "estate-crm-api",
        version: process.env.npm_package_version ?? "0.1.0",
        timestamp: new Date().toISOString(),
        database: "connected",
      };
    } catch (error) {
      app.log.error({ error }, "Database healthcheck failed");

      return reply.status(503).send({
        status: "error",
        service: "estate-crm-api",
        timestamp: new Date().toISOString(),
        database: "unavailable",
      });
    }
  });

  await registerAuthRoutes(app, config, database);
  await registerContactRoutes(app, database);
  await registerPipelineRoutes(app, database);

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === "object" && error !== null && "validation" in error && error.validation) {
      return reply.status(400).send({
        error: "validation_error",
        message: "Проверьте корректность заполненных полей.",
      });
    }

    request.log.error({ error }, "Unhandled request error");

    void reply.status(500).send({
      error: "internal_server_error",
      message: "The request could not be completed.",
    });
  });

  return app;
}
