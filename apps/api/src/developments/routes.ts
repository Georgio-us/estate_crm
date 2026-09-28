import type { FastifyInstance, FastifyReply } from "fastify";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import type {
  ApiErrorResponse,
  CreateDevelopmentDeveloperRequest,
  CreateDevelopmentProjectRequest,
  DevelopmentDeveloperRecord,
  DevelopmentProjectRecord,
  UpdateDevelopmentDeveloperRequest,
  UpdateDevelopmentProjectRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import { canManageDevelopments } from "../auth/authorization.js";
import type { ApiConfig } from "../config.js";
import { propertyStorage } from "../properties/photo-routes.js";
import { developmentCatalogSeed } from "./catalog-seed.js";

const verifiedAt = new Date("2026-09-22T00:00:00.000Z");

function optionalText(value: string | null | undefined) { return value?.trim() || null; }
function slugify(value: string) {
  const base = value.toLocaleLowerCase("ru").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/g, "").slice(0, 72);
  return base || `item-${crypto.randomUUID().slice(0, 8)}`;
}

function mapProject(project: {
  id: string; developerId: string; slug: string; name: string; address: string | null; district: string | null; description: string | null;
  constructionStatus: "PLANNED" | "UNDER_CONSTRUCTION" | "COMPLETED" | "PAUSED"; salesStatus: "EXPECTED" | "LAUNCH" | "OPEN" | "CLOSED";
  plannedCompletion: string | null; className: string | null; buildingsCount: number | null; sectionsCount: number | null; floors: string | null;
  constructionTechnology: string | null; heating: string | null; territory: string | null; parking: string | null; apartmentCondition: string | null;
  ceilingHeight: string | null; installmentTerms: string | null; downPayment: string | null; infrastructure: string | null; managerNote: string | null;
  imageUrl: string | null; sourceUrl: string | null; verifiedAt: Date | null; archivedAt: Date | null; createdAt: Date; updatedAt: Date;
}): DevelopmentProjectRecord {
  return { ...project, verifiedAt: project.verifiedAt?.toISOString() ?? null, archivedAt: project.archivedAt?.toISOString() ?? null, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() };
}

function mapDeveloper(developer: {
  id: string; slug: string; name: string; description: string | null; website: string | null; phone: string | null; email: string | null; logoUrl: string | null;
  coverReadyAt: Date | null; sourceUrl: string | null; verifiedAt: Date | null; archivedAt: Date | null; createdAt: Date; updatedAt: Date;
  projects?: Array<Parameters<typeof mapProject>[0]>;
}): DevelopmentDeveloperRecord {
  const projects = developer.projects ?? [];
  return {
    id: developer.id, slug: developer.slug, name: developer.name, description: developer.description, website: developer.website, phone: developer.phone,
    email: developer.email, logoUrl: developer.logoUrl,
    coverUrl: developer.coverReadyAt ? `/api/crm/development-developers/${developer.id}/cover/content?v=${developer.coverReadyAt.getTime()}` : null,
    sourceUrl: developer.sourceUrl, verifiedAt: developer.verifiedAt?.toISOString() ?? null, archivedAt: developer.archivedAt?.toISOString() ?? null,
    projectCounts: { all: projects.length, construction: projects.filter((item) => item.constructionStatus === "UNDER_CONSTRUCTION").length, completed: projects.filter((item) => item.constructionStatus === "COMPLETED").length, launch: projects.filter((item) => item.salesStatus === "LAUNCH").length },
    ...(developer.projects ? { projects: projects.map(mapProject) } : {}),
    createdAt: developer.createdAt.toISOString(), updatedAt: developer.updatedAt.toISOString(),
  };
}

async function ensureCatalog(database: DatabaseConnection, organizationId: string) {
  if (await database.client.developmentDeveloper.count({ where: { organizationId } })) return;
  await database.client.$transaction(developmentCatalogSeed.map((developer) => database.client.developmentDeveloper.create({
    data: {
      organizationId, slug: developer.slug, name: developer.name, description: developer.description, website: developer.website,
      phone: developer.phone, email: developer.email, sourceUrl: developer.website, verifiedAt,
      projects: { create: developer.projects.map((item) => ({ ...item, organizationId, verifiedAt })) },
    },
  })));
}

const developerFields = {
  name: { type: "string", minLength: 1, maxLength: 200 }, description: { anyOf: [{ type: "string", maxLength: 10_000 }, { type: "null" }] },
  website: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] }, phone: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
  email: { anyOf: [{ type: "string", maxLength: 320 }, { type: "null" }] }, logoUrl: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
  sourceUrl: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
} as const;

const projectFields = {
  name: { type: "string", minLength: 1, maxLength: 300 }, address: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
  district: { anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }] }, description: { anyOf: [{ type: "string", maxLength: 10_000 }, { type: "null" }] },
  constructionStatus: { type: "string", enum: ["PLANNED", "UNDER_CONSTRUCTION", "COMPLETED", "PAUSED"] },
  salesStatus: { type: "string", enum: ["EXPECTED", "LAUNCH", "OPEN", "CLOSED"] },
  plannedCompletion: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] }, className: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
  buildingsCount: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, sectionsCount: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  floors: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] }, imageUrl: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
  constructionTechnology: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] }, heating: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] },
  territory: { anyOf: [{ type: "string", maxLength: 1_000 }, { type: "null" }] }, parking: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
  apartmentCondition: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] }, ceilingHeight: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
  installmentTerms: { anyOf: [{ type: "string", maxLength: 1_000 }, { type: "null" }] }, downPayment: { anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] },
  infrastructure: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] }, managerNote: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
  sourceUrl: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
} as const;

function developerData(body: CreateDevelopmentDeveloperRequest | UpdateDevelopmentDeveloperRequest) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === "string" ? optionalText(value) : value]));
}
function projectData(body: CreateDevelopmentProjectRequest | UpdateDevelopmentProjectRequest) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === "string" ? optionalText(value) : value]));
}

export async function registerDevelopmentRoutes(app: FastifyInstance, database: DatabaseConnection, config: ApiConfig): Promise<void> {
  const storage = propertyStorage(config);
  const forbidden = (reply: FastifyReply) => reply.status(403).send({ error: "forbidden", message: "Управлять новостройками может руководитель или администратор." });

  app.get<{ Querystring: { archived?: "only" | "all" }; Reply: { developers: DevelopmentDeveloperRecord[] } | ApiErrorResponse }>("/development-developers", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    await ensureCatalog(database, user.organization.id);
    const archived = request.query.archived;
    const projectWhere = archived === "only" ? { archivedAt: { not: null } } : archived === "all" ? {} : { archivedAt: null };
    const developerWhere = archived === "only"
      ? { organizationId: user.organization.id, OR: [{ archivedAt: { not: null } }, { projects: { some: { archivedAt: { not: null } } } }] }
      : archived === "all" ? { organizationId: user.organization.id } : { organizationId: user.organization.id, archivedAt: null };
    const developers = await database.client.developmentDeveloper.findMany({ where: developerWhere, include: { projects: { where: projectWhere, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } });
    return { developers: developers.map(mapDeveloper) };
  });

  app.get<{ Params: { developerId: string }; Reply: { developer: DevelopmentDeveloperRecord } | ApiErrorResponse }>("/development-developers/:developerId", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    await ensureCatalog(database, user.organization.id);
    const developer = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, include: { projects: { where: { archivedAt: null }, orderBy: { name: "asc" } } } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found", message: "Застройщик не найден." });
    return { developer: mapDeveloper(developer) };
  });

  app.post<{ Body: CreateDevelopmentDeveloperRequest; Reply: { developer: DevelopmentDeveloperRecord } | ApiErrorResponse }>("/development-developers", { schema: { body: { type: "object", additionalProperties: false, required: ["name"], properties: developerFields } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const slug = `${slugify(request.body.name)}-${crypto.randomUUID().slice(0, 6)}`;
    const developer = await database.client.developmentDeveloper.create({ data: { organizationId: user.organization.id, slug, name: request.body.name.trim(), ...developerData(request.body) }, include: { projects: true } });
    return reply.status(201).send({ developer: mapDeveloper(developer) });
  });

  app.patch<{ Params: { developerId: string }; Body: UpdateDevelopmentDeveloperRequest; Reply: { developer: DevelopmentDeveloperRecord } | ApiErrorResponse }>("/development-developers/:developerId", { schema: { body: { type: "object", additionalProperties: false, minProperties: 1, properties: developerFields } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "developer_not_found", message: "Застройщик не найден." });
    const developer = await database.client.developmentDeveloper.update({ where: { id: existing.id }, data: developerData(request.body), include: { projects: { orderBy: { name: "asc" } } } });
    return { developer: mapDeveloper(developer) };
  });

  app.post<{ Params: { developerId: string }; Body: CreateDevelopmentProjectRequest; Reply: { project: DevelopmentProjectRecord } | ApiErrorResponse }>("/development-developers/:developerId/projects", { schema: { body: { type: "object", additionalProperties: false, required: ["name"], properties: projectFields } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const developer = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found", message: "Застройщик не найден." });
    const project = await database.client.developmentProject.create({ data: { organizationId: user.organization.id, developerId: developer.id, slug: `${slugify(request.body.name)}-${crypto.randomUUID().slice(0, 6)}`, name: request.body.name.trim(), ...projectData(request.body) } });
    return reply.status(201).send({ project: mapProject(project) });
  });

  app.patch<{ Params: { projectId: string }; Body: UpdateDevelopmentProjectRequest; Reply: { project: DevelopmentProjectRecord } | ApiErrorResponse }>("/development-projects/:projectId", { schema: { body: { type: "object", additionalProperties: false, minProperties: 1, properties: projectFields } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentProject.findFirst({ where: { id: request.params.projectId, organizationId: user.organization.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "project_not_found", message: "Проект не найден." });
    const project = await database.client.developmentProject.update({ where: { id: existing.id }, data: projectData(request.body) });
    return { project: mapProject(project) };
  });

  app.post<{ Params: { developerId: string }; Reply: { developer: DevelopmentDeveloperRecord } | ApiErrorResponse }>("/development-developers/:developerId/archive", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "developer_not_found", message: "Застройщик не найден." });
    const developer = await database.client.developmentDeveloper.update({ where: { id: existing.id }, data: { archivedAt: new Date() }, include: { projects: { where: { archivedAt: null }, orderBy: { name: "asc" } } } });
    return { developer: mapDeveloper(developer) };
  });

  app.post<{ Params: { developerId: string }; Reply: { developer: DevelopmentDeveloperRecord } | ApiErrorResponse }>("/development-developers/:developerId/restore", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "developer_not_found", message: "Застройщик не найден." });
    const developer = await database.client.developmentDeveloper.update({ where: { id: existing.id }, data: { archivedAt: null }, include: { projects: { where: { archivedAt: null }, orderBy: { name: "asc" } } } });
    return { developer: mapDeveloper(developer) };
  });

  app.delete<{ Params: { developerId: string }; Reply: { deleted: true } | ApiErrorResponse }>("/development-developers/:developerId", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, include: { projects: { include: { assets: { select: { storageKey: true } } } } } });
    if (!existing) return reply.status(404).send({ error: "developer_not_found", message: "Застройщик не найден." });
    if (!existing.archivedAt) return reply.status(409).send({ error: "developer_not_archived", message: "Сначала перенесите застройщика в архив." });
    const keys = existing.projects.flatMap((project) => project.assets.map((asset) => asset.storageKey));
    if (existing.coverReadyAt) keys.push(`crm/${user.organization.id}/developments/${existing.id}/developer-cover`);
    if (keys.length && !storage) return reply.status(503).send({ error: "storage_not_configured", message: "Нельзя удалить файлы: хранилище R2 не подключено." });
    if (storage) await Promise.all(keys.map((key) => storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }))));
    await database.client.developmentDeveloper.delete({ where: { id: existing.id } });
    return { deleted: true };
  });

  app.post<{ Params: { projectId: string }; Reply: { project: DevelopmentProjectRecord } | ApiErrorResponse }>("/development-projects/:projectId/archive", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentProject.findFirst({ where: { id: request.params.projectId, organizationId: user.organization.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "project_not_found", message: "Проект не найден." });
    return { project: mapProject(await database.client.developmentProject.update({ where: { id: existing.id }, data: { archivedAt: new Date() } })) };
  });

  app.post<{ Params: { projectId: string }; Reply: { project: DevelopmentProjectRecord } | ApiErrorResponse }>("/development-projects/:projectId/restore", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentProject.findFirst({ where: { id: request.params.projectId, organizationId: user.organization.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "project_not_found", message: "Проект не найден." });
    return { project: mapProject(await database.client.developmentProject.update({ where: { id: existing.id }, data: { archivedAt: null } })) };
  });

  app.delete<{ Params: { projectId: string }; Reply: { deleted: true } | ApiErrorResponse }>("/development-projects/:projectId", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return forbidden(reply);
    const existing = await database.client.developmentProject.findFirst({ where: { id: request.params.projectId, organizationId: user.organization.id }, include: { assets: { select: { storageKey: true } } } });
    if (!existing) return reply.status(404).send({ error: "project_not_found", message: "Проект не найден." });
    if (!existing.archivedAt) return reply.status(409).send({ error: "project_not_archived", message: "Сначала перенесите проект в архив." });
    if (existing.assets.length && !storage) return reply.status(503).send({ error: "storage_not_configured", message: "Нельзя удалить файлы: хранилище R2 не подключено." });
    if (storage) await Promise.all(existing.assets.map((asset) => storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: asset.storageKey }))));
    await database.client.developmentProject.delete({ where: { id: existing.id } });
    return { deleted: true };
  });
}
