import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  ApiErrorResponse,
  AuthenticatedUser,
  LoginRequest,
  SessionResponse,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "../config.js";
import { verifyPassword } from "./password.js";
import {
  createSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  sessionExpiry,
} from "./session.js";

const unauthorized: ApiErrorResponse = {
  error: "unauthorized",
  message: "Неверный email или пароль.",
};

function cookieOptions(config: ApiConfig) {
  return {
    path: "/",
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: config.secureCookies ? ("none" as const) : ("lax" as const),
    maxAge: config.sessionDays * 24 * 60 * 60,
  };
}

function mapAuthenticatedUser(session: {
  user: {
    id: string;
    email: string;
    name: string;
    memberships: Array<{
      role: "ADMIN" | "LEAD" | "MANAGER";
      organization: { id: string; name: string; slug: string };
    }>;
  };
}): AuthenticatedUser | null {
  const membership = session.user.memberships[0];

  if (!membership) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    organization: {
      ...membership.organization,
      role: membership.role,
    },
  };
}

async function readSessionUser(
  token: string,
  database: DatabaseConnection,
): Promise<AuthenticatedUser | null> {
  const session = await database.client.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: "ACTIVE" },
            include: { organization: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await database.client.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return mapAuthenticatedUser(session);
}

function clearSessionCookie(reply: FastifyReply, config: ApiConfig): void {
  reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions(config));
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  config: ApiConfig,
  database: DatabaseConnection,
): Promise<void> {
  app.post<{
    Body: LoginRequest;
    Reply: SessionResponse | ApiErrorResponse;
  }>("/auth/login", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: { type: "string", minLength: 3, maxLength: 320 },
          password: { type: "string", minLength: 8, maxLength: 256 },
        },
      },
    },
  }, async (request, reply) => {
    const email = request.body.email.trim().toLowerCase();
    const user = await database.client.user.findUnique({
      where: { email },
      include: {
        memberships: {
          where: { status: "ACTIVE" },
          include: { organization: true },
          take: 1,
        },
      },
    });

    if (!user?.passwordHash || !(await verifyPassword(request.body.password, user.passwordHash))) {
      return reply.status(401).send(unauthorized);
    }

    const authenticatedUser = mapAuthenticatedUser({ user });
    if (!authenticatedUser) {
      return reply.status(401).send(unauthorized);
    }

    const token = createSessionToken();
    await database.client.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expiresAt: sessionExpiry(config.sessionDays),
      },
    });

    reply.setCookie(SESSION_COOKIE_NAME, token, cookieOptions(config));
    return { user: authenticatedUser };
  });

  app.get<{ Reply: SessionResponse | ApiErrorResponse }>("/auth/session", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    const user = token ? await readSessionUser(token, database) : null;

    if (!user) {
      clearSessionCookie(reply, config);
      return reply.status(401).send({
        error: "unauthorized",
        message: "Требуется вход в CRM.",
      });
    }

    return { user };
  });

  app.post<{ Reply: { ok: true } }>("/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];

    if (token) {
      await database.client.session.deleteMany({
        where: { tokenHash: hashSessionToken(token) },
      });
    }

    clearSessionCookie(reply, config);
    return { ok: true };
  });
}
