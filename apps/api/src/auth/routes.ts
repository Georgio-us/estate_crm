import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  ApiErrorResponse,
  AcceptTeamInvitationRequest,
  AuthenticatedUser,
  LoginRequest,
  PublicTeamInvitationResponse,
  SessionResponse,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "../config.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  createSessionToken,
  hashSessionToken,
  SESSION_COOKIE_NAME,
  sessionExpiry,
} from "./session.js";
import { hashInvitationToken } from "../team/invitations.js";

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

export async function readSessionUser(
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
        userAgent: request.headers["user-agent"] ?? null,
        ipAddress: request.ip,
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

  app.get<{ Params: { token: string }; Reply: PublicTeamInvitationResponse | ApiErrorResponse }>("/auth/invitations/:token", {
    schema: {
      params: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string", minLength: 40, maxLength: 100 } },
      },
    },
  }, async (request, reply) => {
    const invitation = await database.client.teamInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(request.params.token) },
      include: { user: true, organization: { select: { id: true, name: true } } },
    });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      return reply.status(404).send({ error: "invitation_not_found", message: "Приглашение недействительно или срок его действия истёк." });
    }
    const membership = await database.client.membership.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: invitation.userId } },
    });
    if (!membership || membership.status !== "INVITED" || membership.role === "ADMIN") {
      return reply.status(404).send({ error: "invitation_not_found", message: "Приглашение больше не ожидает активации." });
    }
    return {
      name: invitation.user.name,
      email: invitation.user.email,
      role: membership.role,
      organizationName: invitation.organization.name,
      expiresAt: invitation.expiresAt.toISOString(),
      existingAccount: Boolean(invitation.user.passwordHash),
    };
  });

  app.post<{ Params: { token: string }; Body: AcceptTeamInvitationRequest; Reply: SessionResponse | ApiErrorResponse }>("/auth/invitations/:token/accept", {
    schema: {
      params: {
        type: "object",
        required: ["token"],
        properties: { token: { type: "string", minLength: 40, maxLength: 100 } },
      },
      body: {
        type: "object",
        additionalProperties: false,
        required: ["password"],
        properties: { password: { type: "string", minLength: 8, maxLength: 256 } },
      },
    },
  }, async (request, reply) => {
    const invitation = await database.client.teamInvitation.findUnique({
      where: { tokenHash: hashInvitationToken(request.params.token) },
      include: { user: true, organization: { select: { id: true, name: true, slug: true } } },
    });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      return reply.status(404).send({ error: "invitation_not_found", message: "Приглашение недействительно или срок его действия истёк." });
    }
    const membership = await database.client.membership.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: invitation.userId } },
    });
    if (!membership || membership.status !== "INVITED") {
      return reply.status(409).send({ error: "invitation_used", message: "Это приглашение уже было активировано или отменено." });
    }
    if (invitation.user.passwordHash && !(await verifyPassword(request.body.password, invitation.user.passwordHash))) {
      return reply.status(401).send({ error: "invalid_password", message: "Пароль существующей учётной записи указан неверно." });
    }

    const passwordHash = invitation.user.passwordHash ?? await hashPassword(request.body.password);
    const sessionToken = createSessionToken();
    const expiresAt = sessionExpiry(config.sessionDays);
    await database.client.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: invitation.userId }, data: { passwordHash } });
      await transaction.membership.update({ where: { id: membership.id }, data: { status: "ACTIVE" } });
      await transaction.teamInvitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await transaction.teamInvitation.updateMany({
        where: { organizationId: invitation.organizationId, userId: invitation.userId, id: { not: invitation.id }, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.session.create({ data: { tokenHash: hashSessionToken(sessionToken), userId: invitation.userId, expiresAt, userAgent: request.headers["user-agent"] ?? null, ipAddress: request.ip } });
    });

    const authenticatedUser: AuthenticatedUser = {
      id: invitation.user.id,
      email: invitation.user.email,
      name: invitation.user.name,
      organization: { ...invitation.organization, role: membership.role },
    };
    reply.setCookie(SESSION_COOKIE_NAME, sessionToken, cookieOptions(config));
    return { user: authenticatedUser };
  });
}
