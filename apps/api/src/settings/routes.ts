import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  SessionListResponse,
  TaskTypeListResponse,
  UpdateTaskTypesRequest,
  UpdateProfileRequest,
  UpdateWorkspaceSettingsRequest,
  WorkspaceSettingsResponse,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { canConfigureOrganization } from "../auth/authorization.js";
import { requireUser } from "../auth/require-user.js";
import { hashSessionToken, SESSION_COOKIE_NAME } from "../auth/session.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { parsePhone } from "../lib/phone.js";
import type { ApiConfig } from "../config.js";
import { propertyStorage } from "../properties/photo-routes.js";

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
    currency: { type: "string", enum: ["USD", "EUR", "UAH"] },
  },
} as const;

const taskTypesBody = {
  type: "object",
  additionalProperties: false,
  required: ["taskTypes"],
  properties: {
    taskTypes: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "baseKind", "isActive"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", minLength: 1, maxLength: 80 },
          baseKind: { type: "string", enum: ["CALL", "MEETING", "MESSAGE", "OTHER"] },
          isActive: { type: "boolean" },
        },
      },
    },
  },
} as const;

const defaultTaskTypes = [
  { key: "call", name: "Звонок", baseKind: "CALL" as const, position: 0 },
  { key: "meeting", name: "Встреча", baseKind: "MEETING" as const, position: 1 },
  { key: "message", name: "Сообщение", baseKind: "MESSAGE" as const, position: 2 },
  { key: "showing", name: "Показ объекта", baseKind: "MEETING" as const, position: 3 },
  { key: "other", name: "Другое", baseKind: "OTHER" as const, position: 4 },
];

const referenceKinds = ["LEAD_SOURCE", "DISTRICT", "PROPERTY_TYPE", "LOSS_REASON"] as const;
type ReferenceKind = typeof referenceKinds[number];
const defaultReferences: Record<ReferenceKind, string[]> = {
  LEAD_SOURCE: ["Meta", "Сайт", "Звонок", "Рекомендация", "Вручную"],
  DISTRICT: ["Приморский", "Киевский", "Хаджибейский", "Пересыпский"],
  PROPERTY_TYPE: ["Квартира", "Дом", "Коммерция", "Земельный участок", "Пентхаус"],
  LOSS_REASON: ["Дорого", "Не отвечает", "Выбрал другой объект", "Отложил решение", "Неактуально"],
};

async function referencesForOrganization(database: DatabaseConnection, organizationId: string) {
  const count = await database.client.organizationReference.count({ where: { organizationId } });
  if (!count) {
    await database.client.organizationReference.createMany({
      data: referenceKinds.flatMap((kind) => defaultReferences[kind].map((label, position) => ({ organizationId, kind, key: `default-${position}`, label, position }))),
      skipDuplicates: true,
    });
  }
  return database.client.organizationReference.findMany({ where: { organizationId }, orderBy: [{ kind: "asc" }, { position: "asc" }, { createdAt: "asc" }] });
}

async function taskTypesForOrganization(database: DatabaseConnection, organizationId: string) {
  const count = await database.client.taskType.count({ where: { organizationId } });
  if (!count) {
    await database.client.taskType.createMany({
      data: defaultTaskTypes.map((item) => ({ ...item, organizationId })),
      skipDuplicates: true,
    });
  }
  return database.client.taskType.findMany({
    where: { organizationId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { tasks: true } } },
  });
}

function presentTaskTypes(taskTypes: Awaited<ReturnType<typeof taskTypesForOrganization>>): TaskTypeListResponse {
  return { taskTypes: taskTypes.map(({ _count, ...taskType }) => ({ ...taskType, taskCount: _count.tasks })) };
}

const profileBody = {
  type: "object",
  additionalProperties: false,
  required: ["name"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 200 },
    phone: { anyOf: [{ type: "string", maxLength: 50 }, { type: "null" }] },
  },
} as const;
const managerPermissionsBody = { type: "object", additionalProperties: false, required: ["seeAllDeals", "seeUnassignedPhones", "claimUnassigned", "manageDevelopments", "exportData"], properties: { seeAllDeals: { type: "boolean" }, seeUnassignedPhones: { type: "boolean" }, claimUnassigned: { type: "boolean" }, manageDevelopments: { type: "boolean" }, exportData: { type: "boolean" } } } as const;

function nullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function sessionPresentation(userAgent: string | null) {
  const value = userAgent || "";
  const device = /iPhone/i.test(value) ? "iPhone" : /iPad/i.test(value) ? "iPad" : /Android/i.test(value) ? "Android" : /Macintosh|Mac OS/i.test(value) ? "Mac" : /Windows/i.test(value) ? "Windows" : /Linux/i.test(value) ? "Linux" : "Неизвестное устройство";
  const browser = /Edg\//i.test(value) ? "Edge" : /CriOS|Chrome\//i.test(value) ? "Chrome" : /Firefox\//i.test(value) ? "Firefox" : /Safari\//i.test(value) ? "Safari" : "Браузер";
  return { device, browser };
}

export async function registerSettingsRoutes(app: FastifyInstance, database: DatabaseConnection, config: ApiConfig): Promise<void> {
  const r2 = propertyStorage(config);
  app.get<{ Reply: TaskTypeListResponse | ApiErrorResponse }>("/settings/task-types", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    return presentTaskTypes(await taskTypesForOrganization(database, user.organization.id));
  });

  app.get("/settings/references", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const references = await referencesForOrganization(database, user.organization.id);
    return { groups: Object.fromEntries(referenceKinds.map((kind) => [kind, references.filter((item) => item.kind === kind)])) };
  });

  app.put<{ Body: { groups: Record<ReferenceKind, Array<{ id?: string; label: string; isActive: boolean }>> } }>("/settings/references", {
    schema: { body: { type: "object", additionalProperties: false, required: ["groups"], properties: { groups: { type: "object", additionalProperties: false, required: referenceKinds, properties: Object.fromEntries(referenceKinds.map((kind) => [kind, { type: "array", maxItems: 100, items: { type: "object", additionalProperties: false, required: ["label", "isActive"], properties: { id: { type: "string", format: "uuid" }, label: { type: "string", minLength: 1, maxLength: 100 }, isActive: { type: "boolean" } } } }])) } } } } as const,
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canConfigureOrganization(user)) return reply.status(403).send({ error: "forbidden" });
    const existing = await referencesForOrganization(database, user.organization.id);
    const byId = new Map(existing.map((item) => [item.id, item]));
    const submittedIds = new Set(Object.values(request.body.groups).flat().map((item) => item.id).filter((id): id is string => Boolean(id)));
    if ([...submittedIds].some((id) => !byId.has(id))) return reply.status(404).send({ error: "reference_not_found" });
    const operations = referenceKinds.flatMap((kind) => request.body.groups[kind].map((item, position) => item.id
      ? database.client.organizationReference.update({ where: { id: item.id }, data: { label: item.label.trim(), isActive: item.isActive, position } })
      : database.client.organizationReference.create({ data: { organizationId: user.organization.id, kind, key: `custom-${randomUUID()}`, label: item.label.trim(), isActive: item.isActive, position } })));
    for (const item of existing) if (!submittedIds.has(item.id)) operations.push(database.client.organizationReference.update({ where: { id: item.id }, data: { isActive: false } }));
    await database.client.$transaction(operations);
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, authorId: user.id, category: "CHANGE", title: "Справочники CRM обновлены" } });
    const references = await referencesForOrganization(database, user.organization.id);
    return { groups: Object.fromEntries(referenceKinds.map((kind) => [kind, references.filter((item) => item.kind === kind)])) };
  });

  app.get("/settings/manager-permissions", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canConfigureOrganization(user)) return reply.status(403).send({ error: "forbidden" });
    const organization = await database.client.organization.findUniqueOrThrow({ where: { id: user.organization.id }, select: { managersSeeAllDeals: true, managersSeeUnassignedPhones: true, managersCanClaimUnassigned: true, managersCanManageDevelopments: true, managersCanExport: true } });
    return { seeAllDeals: organization.managersSeeAllDeals, seeUnassignedPhones: organization.managersSeeUnassignedPhones, claimUnassigned: organization.managersCanClaimUnassigned, manageDevelopments: organization.managersCanManageDevelopments, exportData: organization.managersCanExport };
  });

  app.put<{ Body: { seeAllDeals: boolean; seeUnassignedPhones: boolean; claimUnassigned: boolean; manageDevelopments: boolean; exportData: boolean } }>("/settings/manager-permissions", { schema: { body: managerPermissionsBody } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canConfigureOrganization(user)) return reply.status(403).send({ error: "forbidden" });
    await database.client.organization.update({ where: { id: user.organization.id }, data: { managersSeeAllDeals: request.body.seeAllDeals, managersSeeUnassignedPhones: request.body.seeUnassignedPhones, managersCanClaimUnassigned: request.body.claimUnassigned, managersCanManageDevelopments: request.body.manageDevelopments, managersCanExport: request.body.exportData } });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, authorId: user.id, category: "CHANGE", title: "Полномочия менеджеров обновлены" } });
    return request.body;
  });

  app.put<{ Body: UpdateTaskTypesRequest; Reply: TaskTypeListResponse | ApiErrorResponse }>("/settings/task-types", { schema: { body: taskTypesBody } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!canConfigureOrganization(user)) return reply.status(403).send({ error: "forbidden", message: "Типы задач может настраивать только администратор." });
    if (!request.body.taskTypes.some((item) => item.isActive)) return reply.status(400).send({ error: "active_task_type_required", message: "Оставьте хотя бы один активный тип задачи." });

    const existing = await taskTypesForOrganization(database, user.organization.id);
    const existingById = new Map(existing.map((item) => [item.id, item]));
    if (request.body.taskTypes.some((item) => item.id && !existingById.has(item.id))) {
      return reply.status(404).send({ error: "task_type_not_found", message: "Один из типов задач не найден." });
    }

    await database.client.$transaction(request.body.taskTypes.map((item, position) => item.id
      ? database.client.taskType.update({ where: { id: item.id }, data: { name: item.name.trim(), baseKind: item.baseKind, isActive: item.isActive, position } })
      : database.client.taskType.create({ data: { organizationId: user.organization.id, key: `custom-${randomUUID()}`, name: item.name.trim(), baseKind: item.baseKind, isActive: item.isActive, position } })));
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, authorId: user.id, category: "CHANGE", title: "Типы задач обновлены" } });
    return presentTaskTypes(await taskTypesForOrganization(database, user.organization.id));
  });

  app.get<{ Reply: WorkspaceSettingsResponse | ApiErrorResponse }>("/settings", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const [workspace, profile] = await Promise.all([
      database.client.organization.findUniqueOrThrow({ where: { id: user.organization.id }, select: { name: true, companyName: true, phone: true, email: true, timezone: true, currency: true } }),
      database.client.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true, email: true, phone: true, avatarReadyAt: true } }),
    ]);
    return { workspace, profile: { name: profile.name, email: profile.email, phone: profile.phone, avatarUrl: profile.avatarReadyAt ? `/api/crm/settings/profile/avatar?v=${profile.avatarReadyAt.getTime()}` : null } };
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
    const profile = await database.client.user.update({ where: { id: user.id }, data: { name: request.body.name.trim(), phone: parsedPhone?.formatted ?? null }, select: { name: true, email: true, phone: true, avatarReadyAt: true } });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, authorId: user.id, category: "CHANGE", title: "Профиль сотрудника обновлён" } });
    return { name: profile.name, email: profile.email, phone: profile.phone, avatarUrl: profile.avatarReadyAt ? `/api/crm/settings/profile/avatar?v=${profile.avatarReadyAt.getTime()}` : null };
  });

  const avatarBody = { type: "object", additionalProperties: false, required: ["filename", "mimeType", "sizeBytes"], properties: { filename: { type: "string", minLength: 1, maxLength: 255 }, mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"] }, sizeBytes: { type: "integer", minimum: 1, maximum: 10 * 1024 * 1024 } } } as const;
  app.post<{ Body: { filename: string; mimeType: string; sizeBytes: number } }>("/settings/profile/avatar/prepare", { schema: { body: avatarBody } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!r2) return reply.status(503).send({ error: "storage_not_configured", message: "Хранилище изображений не подключено." });
    const key = `crm/${user.organization.id}/profiles/${user.id}/${randomUUID()}`;
    const previous = await database.client.user.findUnique({ where: { id: user.id }, select: { avatarStorageKey: true } });
    await database.client.user.update({ where: { id: user.id }, data: { avatarStorageKey: key, avatarMimeType: request.body.mimeType, avatarSizeBytes: request.body.sizeBytes, avatarReadyAt: null } });
    if (previous?.avatarStorageKey) await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: previous.avatarStorageKey })).catch(() => undefined);
    const uploadUrl = await getSignedUrl(r2.client, new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: request.body.mimeType }), { expiresIn: 300 });
    return { uploadUrl };
  });

  app.post("/settings/profile/avatar/finalize", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    const profile = await database.client.user.findUnique({ where: { id: user.id }, select: { avatarStorageKey: true, avatarSizeBytes: true } });
    if (!profile?.avatarStorageKey || !profile.avatarSizeBytes) return reply.status(404).send({ error: "avatar_not_prepared" });
    const size = (await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: profile.avatarStorageKey }))).ContentLength;
    if (size !== profile.avatarSizeBytes) return reply.status(409).send({ error: "upload_size_mismatch", message: "Размер загруженного файла не совпадает." });
    const avatarReadyAt = new Date();
    await database.client.user.update({ where: { id: user.id }, data: { avatarReadyAt } });
    return { avatarUrl: `/api/crm/settings/profile/avatar?v=${avatarReadyAt.getTime()}` };
  });

  app.get("/settings/profile/avatar", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    const profile = await database.client.user.findUnique({ where: { id: user.id }, select: { avatarStorageKey: true, avatarReadyAt: true } });
    if (!profile?.avatarStorageKey || !profile.avatarReadyAt) return reply.status(404).send({ error: "avatar_not_found" });
    return reply.redirect(await getSignedUrl(r2.client, new GetObjectCommand({ Bucket: r2.bucket, Key: profile.avatarStorageKey }), { expiresIn: 60 }));
  });

  app.delete("/settings/profile/avatar", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const profile = await database.client.user.findUnique({ where: { id: user.id }, select: { avatarStorageKey: true } });
    if (profile?.avatarStorageKey && r2) await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: profile.avatarStorageKey })).catch(() => undefined);
    await database.client.user.update({ where: { id: user.id }, data: { avatarStorageKey: null, avatarMimeType: null, avatarSizeBytes: null, avatarReadyAt: null } });
    return { ok: true };
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

  app.post<{ Body: { currentPassword: string; newPassword: string }; Reply: { ok: true } | ApiErrorResponse }>("/settings/password", { schema: { body: { type: "object", additionalProperties: false, required: ["currentPassword", "newPassword"], properties: { currentPassword: { type: "string", minLength: 8, maxLength: 256 }, newPassword: { type: "string", minLength: 8, maxLength: 256 } } } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (request.body.currentPassword === request.body.newPassword) return reply.status(400).send({ error: "same_password", message: "Новый пароль должен отличаться от текущего." });
    const account = await database.client.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!account?.passwordHash || !await verifyPassword(request.body.currentPassword, account.passwordHash)) return reply.status(401).send({ error: "invalid_password", message: "Текущий пароль указан неверно." });
    const passwordHash = await hashPassword(request.body.newPassword);
    const token = request.cookies[SESSION_COOKIE_NAME];
    const currentHash = token ? hashSessionToken(token) : "";
    await database.client.$transaction([
      database.client.user.update({ where: { id: user.id }, data: { passwordHash } }),
      database.client.session.deleteMany({ where: { userId: user.id, tokenHash: { not: currentHash } } }),
      database.client.passwordResetToken.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: new Date() } }),
      database.client.activityEvent.create({ data: { organizationId: user.organization.id, authorId: user.id, category: "CHANGE", title: "Пароль аккаунта изменён" } }),
    ]);
    return { ok: true };
  });
}
