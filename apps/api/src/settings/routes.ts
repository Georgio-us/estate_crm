import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  SessionListResponse,
  UpdateProfileRequest,
  UpdateWorkspaceSettingsRequest,
  WorkspaceSettingsResponse,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { canConfigureOrganization } from "../auth/authorization.js";
import { requireUser } from "../auth/require-user.js";
import { hashSessionToken, SESSION_COOKIE_NAME } from "../auth/session.js";
import { parsePhone } from "../lib/phone.js";

const workspaceBody = {
  type: "object",
  additionalProperties: false,
  required: ["name", "timezone", "currency"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    companyName: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] },
    phone: { anyOf: [{ type: "string", maxLength: 50 }, { type: "null" }] },
    email: { anyOf: [{ type: "string", format: "email", maxLength: 320 }, { type: "null" }] },
    timezone: { type: "string", enum: ["Europe/Madrid", "Europe/Kyiv", "UTC"] },
    currency: { type: "string", enum: ["USD", "EUR"] },
  },
} as const;

const profileBody = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    phone: { anyOf: [{ type: "string", maxLength: 50 }, { type: "null" }] },
  },
} as const;

function nullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function sessionPresentation(userAgent: string | null) {
  const value = userAgent || "";
  const device = /iPhone/i.test(value) ? "iPhone" : /iPad/i.test(value) ? "iPad" : /Android/i.test(value) ? "Android" : /Macintosh|Mac OS/i.test(value) ? "Mac" : /Windows/i.test(value) ? "Windows" : /Linux/i.test(value) ? "Linux" : "Неизвестное устройство";
  const browser = /Edg\//i.test(value) ? "Edge" : /CriOS|Chrome\//i.test(value) ? "Chrome" : /Firefox\//i.test(value) ? "Firefox" : /Safari\//i.test(value) ? "Safari" : "Браузер";
  return { device, browser };
}

export async function registerSettingsRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: WorkspaceSettingsResponse | ApiErrorResponse }>("/settings", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const [workspace, profile] = await Promise.all([
      database.client.organization.findUniqueOrThrow({ where: { id: user.organization.id }, select: { name: true, companyName: true, phone: true, email: true, timezone: true, currency: true } }),
      database.client.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, email: true, phone: true } }),
    ]);
    return { workspace, profile };
  });

  app.patch<{ Body: UpdateWorkspaceSettingsRequest; Reply: WorkspaceSettingsResponse["workspace"] | ApiErrorResponse }>("/settings/workspace", { schema: { body: workspaceBody } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!canConfigureOrganization(user)) return reply.status(403).send({ error: "forbidden", message: "Настройки пространства доступны только администратору." });
    const parsedPhone = request.body.phone ? parsePhone(request.body.phone) : null;
    if (request.body.phone && !parsedPhone) return reply.status(400).send({ error: "invalid_phone", message: "Введите корректный рабочий телефон." });
    const workspace = await database.client.organization.update({
      where: { id: user.organization.id },
      data: {
        name: request.body.name.trim(),
        companyName: nullableText(request.body.companyName),
        phone: parsedPhone?.formatted ?? null,
        email: nullableText(request.body.email)?.toLowerCase() ?? null,
        timezone: request.body.timezone,
        currency: request.body.currency,
      },
      select: { name: true, companyName: true, phone: true, email: true, timezone: true, currency: true },
    });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, authorId: user.id, category: "CHANGE", title: "Настройки пространства обновлены" } });
    return workspace;
  });

  app.patch<{ Body: UpdateProfileRequest; Reply: WorkspaceSettingsResponse["profile"] | ApiErrorResponse }>("/settings/profile", { schema: { body: profileBody } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const parsedPhone = request.body.phone ? parsePhone(request.body.phone) : null;
    if (request.body.phone && !parsedPhone) return reply.status(400).send({ error: "invalid_phone", message: "Введите корректный номер телефона." });
    const profile = await database.client.user.update({ where: { id: user.id }, data: { name: request.body.name.trim(), phone: parsedPhone?.formatted ?? null }, select: { name: true, email: true, phone: true } });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, authorId: user.id, category: "CHANGE", title: "Профиль сотрудника обновлён" } });
    return profile;
  });

  app.get<{ Reply: SessionListResponse | ApiErrorResponse }>("/settings/sessions", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const token = request.cookies[SESSION_COOKIE_NAME];
    const currentHash = token ? hashSessionToken(token) : null;
    const sessions = await database.client.session.findMany({ where: { userId: user.id, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } });
    return { sessions: sessions.map((session) => ({ id: session.id, current: session.tokenHash === currentHash, ...sessionPresentation(session.userAgent), ipAddress: session.ipAddress, createdAt: session.createdAt.toISOString(), lastSeenAt: session.lastSeenAt.toISOString(), expiresAt: session.expiresAt.toISOString() })) };
  });

  app.delete<{ Params: { sessionId: string }; Reply: { ok: true } | ApiErrorResponse }>("/settings/sessions/:sessionId", { schema: { params: { type: "object", required: ["sessionId"], properties: { sessionId: { type: "string", format: "uuid" } } } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = await database.client.session.findFirst({ where: { id: request.params.sessionId, userId: user.id } });
    if (!session) return reply.status(404).send({ error: "session_not_found", message: "Сеанс не найден." });
    if (token && session.tokenHash === hashSessionToken(token)) return reply.status(409).send({ error: "current_session", message: "Текущий сеанс завершается через выход из аккаунта." });
    await database.client.session.delete({ where: { id: session.id } });
    return { ok: true };
  });

  app.post<{ Reply: { ok: true } | ApiErrorResponse }>("/settings/sessions/revoke-others", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const token = request.cookies[SESSION_COOKIE_NAME];
    const currentHash = token ? hashSessionToken(token) : "";
    await database.client.session.deleteMany({ where: { userId: user.id, tokenHash: { not: currentHash } } });
    return { ok: true };
  });
}
