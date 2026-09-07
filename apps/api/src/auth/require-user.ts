import type { FastifyReply, FastifyRequest } from "fastify";

import type { AuthenticatedUser } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { readSessionUser } from "./routes.js";
import { SESSION_COOKIE_NAME } from "./session.js";

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  database: DatabaseConnection,
): Promise<AuthenticatedUser | null> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const user = token ? await readSessionUser(token, database) : null;

  if (!user) {
    await reply.status(401).send({
      error: "unauthorized",
      message: "Требуется вход в CRM.",
    });
  }

  return user;
}
