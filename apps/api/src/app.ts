import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";

import type { HealthResponse } from "@estate-crm/contracts";

import type { ApiConfig } from "./config.js";

export async function buildApp(config: ApiConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: config.webOrigins,
    credentials: true,
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => ({
    status: "ok",
    service: "estate-crm-api",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  }));

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, "Unhandled request error");

    void reply.status(500).send({
      error: "internal_server_error",
      message: "The request could not be completed.",
    });
  });

  return app;
}
