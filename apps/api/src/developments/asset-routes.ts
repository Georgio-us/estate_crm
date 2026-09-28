import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FastifyInstance } from "fastify";

import type { DevelopmentAssetKind, DevelopmentAssetRecord } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import type { ApiConfig } from "../config.js";
import { propertyStorage } from "../properties/photo-routes.js";

const imageMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"] as const;
const documentMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
] as const;
const assetKinds = ["COVER", "GALLERY", "CHESSBOARD", "PRICE_LIST", "LAYOUT", "PROMOTION", "PRESENTATION", "PERMIT", "OTHER"] as const;
const maxImageBytes = 25 * 1024 * 1024;
const maxDocumentBytes = 100 * 1024 * 1024;

type AssetWithBatch = {
  id: string; projectId: string; filename: string; mimeType: string; sizeBytes: number; kind: DevelopmentAssetKind;
  status: "PENDING" | "READY" | "PROCESSING" | "REVIEW_REQUIRED" | "FAILED"; version: number; isCover: boolean;
  sortOrder: number; errorMessage: string | null; createdAt: Date; readyAt: Date | null;
  importBatch: null | { id: string; assetId: string; status: "DRAFT" | "PROCESSING" | "REVIEW_REQUIRED" | "PUBLISHED" | "FAILED"; parserKey: string | null; errorMessage: string | null; createdAt: Date; updatedAt: Date; publishedAt: Date | null; _count: { rows: number }; rows: Array<{ approved: boolean }> };
};

function mapAsset(asset: AssetWithBatch): DevelopmentAssetRecord {
  return {
    id: asset.id, projectId: asset.projectId, filename: asset.filename, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes,
    kind: asset.kind, status: asset.status, version: asset.version, isCover: asset.isCover, sortOrder: asset.sortOrder,
    errorMessage: asset.errorMessage, url: `/api/crm/development-projects/${asset.projectId}/assets/${asset.id}/content`,
    createdAt: asset.createdAt.toISOString(), readyAt: asset.readyAt?.toISOString() ?? null,
    importBatch: asset.importBatch ? {
      id: asset.importBatch.id, assetId: asset.importBatch.assetId, status: asset.importBatch.status,
      parserKey: asset.importBatch.parserKey, rowCount: asset.importBatch._count.rows,
      approvedCount: asset.importBatch.rows.filter((row) => row.approved).length, errorMessage: asset.importBatch.errorMessage,
      createdAt: asset.importBatch.createdAt.toISOString(), updatedAt: asset.importBatch.updatedAt.toISOString(),
      publishedAt: asset.importBatch.publishedAt?.toISOString() ?? null,
    } : null,
  };
}

const assetInclude = { importBatch: { include: { _count: { select: { rows: true } }, rows: { select: { approved: true } } } } } as const;

export async function registerDevelopmentAssetRoutes(app: FastifyInstance, database: DatabaseConnection, config: ApiConfig) {
  const r2 = propertyStorage(config);
  const canManage = (role: "ADMIN" | "LEAD" | "MANAGER") => role !== "MANAGER";
  const paramsSchema = { type: "object", required: ["projectId"], properties: { projectId: { type: "string", format: "uuid" }, assetId: { type: "string", format: "uuid" } } } as const;
  async function projectForUser(projectId: string, organizationId: string) {
    return database.client.developmentProject.findFirst({ where: { id: projectId, organizationId }, select: { id: true, developerId: true } });
  }

  app.get<{ Params: { projectId: string }; Reply: { assets: DevelopmentAssetRecord[] } | { error: string } }>("/development-projects/:projectId/assets", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!await projectForUser(request.params.projectId, user.organization.id)) return reply.status(404).send({ error: "project_not_found" });
    const assets = await database.client.developmentAsset.findMany({
      where: { organizationId: user.organization.id, projectId: request.params.projectId, status: { not: "PENDING" } },
      include: assetInclude, orderBy: [{ isCover: "desc" }, { kind: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    });
    return { assets: assets.map((asset) => mapAsset(asset as AssetWithBatch)) };
  });

  app.post<{ Params: { projectId: string }; Body: { filename: string; mimeType: string; sizeBytes: number; kind: DevelopmentAssetKind }; Reply: { assetId: string; uploadUrl: string; expiresIn: number } | { error: string; message: string } }>("/development-projects/:projectId/assets/prepare", {
    schema: { params: paramsSchema, body: { type: "object", additionalProperties: false, required: ["filename", "mimeType", "sizeBytes", "kind"], properties: {
      filename: { type: "string", minLength: 1, maxLength: 255 }, mimeType: { type: "string", enum: [...imageMimeTypes, ...documentMimeTypes] },
      sizeBytes: { type: "integer", minimum: 1, maximum: maxDocumentBytes }, kind: { type: "string", enum: assetKinds },
    } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden", message: "Управлять файлами новостроек может руководитель или администратор." });
    const project = await projectForUser(request.params.projectId, user.organization.id);
    if (!project) return reply.status(404).send({ error: "project_not_found", message: "Проект не найден." });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured", message: "Cloudflare R2 не подключён на сервере." });
    const image = imageMimeTypes.includes(request.body.mimeType as typeof imageMimeTypes[number]);
    if ((request.body.kind === "COVER" || request.body.kind === "GALLERY") && !image) return reply.status(400).send({ error: "invalid_asset_type", message: "Для обложки и галереи выберите изображение." });
    if (request.body.sizeBytes > (image ? maxImageBytes : maxDocumentBytes)) return reply.status(413).send({ error: "asset_too_large", message: image ? "Изображение должно быть не больше 25 МБ." : "Документ должен быть не больше 100 МБ." });
    const latest = await database.client.developmentAsset.findFirst({ where: { projectId: project.id, kind: request.body.kind }, orderBy: { version: "desc" }, select: { version: true } });
    const key = `crm/${user.organization.id}/developments/${project.developerId}/${project.id}/${request.body.kind.toLocaleLowerCase()}/${randomUUID()}`;
    const asset = await database.client.developmentAsset.create({ data: {
      organizationId: user.organization.id, projectId: project.id, uploadedById: user.id, storageKey: key,
      filename: request.body.filename, mimeType: request.body.mimeType, sizeBytes: request.body.sizeBytes, kind: request.body.kind,
      version: (latest?.version ?? 0) + 1,
    } });
    const uploadUrl = await getSignedUrl(r2.client, new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: request.body.mimeType }), { expiresIn: 300 });
    return reply.status(201).send({ assetId: asset.id, uploadUrl, expiresIn: 300 });
  });

  app.post<{ Params: { projectId: string; assetId: string } }>("/development-projects/:projectId/assets/:assetId/finalize", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden" });
    const asset = await database.client.developmentAsset.findFirst({ where: { id: request.params.assetId, projectId: request.params.projectId, organizationId: user.organization.id } });
    if (!asset) return reply.status(404).send({ error: "asset_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    if (asset.status !== "PENDING") return { assetId: asset.id, status: asset.status };
    let size: number | undefined;
    try { size = (await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: asset.storageKey }))).ContentLength; }
    catch { return reply.status(409).send({ error: "upload_missing", message: "Файл не найден в хранилище. Повторите загрузку." }); }
    if (size !== asset.sizeBytes) return reply.status(409).send({ error: "upload_size_mismatch", message: "Размер загруженного файла не совпадает с исходным." });
    const isImage = imageMimeTypes.includes(asset.mimeType as typeof imageMimeTypes[number]);
    const needsImportDraft = asset.kind === "CHESSBOARD" || asset.kind === "PRICE_LIST";
    await database.client.$transaction(async (tx) => {
      const coverCount = isImage ? await tx.developmentAsset.count({ where: { projectId: asset.projectId, status: "READY", isCover: true } }) : 0;
      if (asset.kind === "COVER") await tx.developmentAsset.updateMany({ where: { projectId: asset.projectId, isCover: true }, data: { isCover: false } });
      const becomesCover = isImage && (asset.kind === "COVER" || coverCount === 0);
      await tx.developmentAsset.update({ where: { id: asset.id }, data: {
        status: isImage ? "READY" : "REVIEW_REQUIRED", readyAt: new Date(), isCover: becomesCover,
      } });
      if (becomesCover) await tx.developmentProject.update({ where: { id: asset.projectId }, data: { imageUrl: `/api/crm/development-projects/${asset.projectId}/assets/${asset.id}/content` } });
      if (needsImportDraft) await tx.developmentImportBatch.create({ data: { organizationId: user.organization.id, projectId: asset.projectId, assetId: asset.id, status: "DRAFT" } });
    });
    return { assetId: asset.id, status: isImage ? "READY" : "REVIEW_REQUIRED" };
  });

  app.get<{ Params: { projectId: string; assetId: string } }>("/development-projects/:projectId/assets/:assetId/content", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const asset = await database.client.developmentAsset.findFirst({ where: { id: request.params.assetId, projectId: request.params.projectId, organizationId: user.organization.id, status: { not: "PENDING" } } });
    if (!asset) return reply.status(404).send({ error: "asset_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    return reply.redirect(await getSignedUrl(r2.client, new GetObjectCommand({ Bucket: r2.bucket, Key: asset.storageKey, ResponseContentDisposition: `inline; filename="${encodeURIComponent(asset.filename)}"` }), { expiresIn: 60 }));
  });

  app.get<{ Params: { projectId: string; assetId: string } }>("/development-projects/:projectId/assets/:assetId/source", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden" });
    const asset = await database.client.developmentAsset.findFirst({ where: { id: request.params.assetId, projectId: request.params.projectId, organizationId: user.organization.id, status: { not: "PENDING" } } });
    if (!asset) return reply.status(404).send({ error: "asset_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    const object = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: asset.storageKey }));
    if (!object.Body) return reply.status(404).send({ error: "asset_not_found" });
    reply.header("content-type", asset.mimeType).header("content-disposition", `inline; filename="${encodeURIComponent(asset.filename)}"`).header("cache-control", "private, no-store");
    return reply.send(Buffer.from(await object.Body.transformToByteArray()));
  });

  app.patch<{ Params: { projectId: string; assetId: string }; Body: { isCover?: boolean; reviewed?: boolean } }>("/development-projects/:projectId/assets/:assetId", { schema: { params: paramsSchema, body: { type: "object", additionalProperties: false, minProperties: 1, properties: { isCover: { type: "boolean" }, reviewed: { type: "boolean" } } } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden" });
    const asset = await database.client.developmentAsset.findFirst({ where: { id: request.params.assetId, projectId: request.params.projectId, organizationId: user.organization.id }, include: assetInclude });
    if (!asset) return reply.status(404).send({ error: "asset_not_found" });
    if (request.body.isCover && !asset.mimeType.startsWith("image/")) return reply.status(400).send({ error: "cover_must_be_image", message: "Обложкой может быть только изображение." });
    await database.client.$transaction(async (tx) => {
      if (request.body.isCover) await tx.developmentAsset.updateMany({ where: { projectId: asset.projectId, isCover: true }, data: { isCover: false } });
      await tx.developmentAsset.update({ where: { id: asset.id }, data: {
        ...(request.body.isCover !== undefined ? { isCover: request.body.isCover } : {}),
        ...(request.body.reviewed && asset.status === "REVIEW_REQUIRED" ? { status: "READY" } : {}),
      } });
      if (request.body.isCover) await tx.developmentProject.update({ where: { id: asset.projectId }, data: { imageUrl: `/api/crm/development-projects/${asset.projectId}/assets/${asset.id}/content` } });
    });
    return { updated: true };
  });

  app.delete<{ Params: { projectId: string; assetId: string } }>("/development-projects/:projectId/assets/:assetId", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden" });
    const asset = await database.client.developmentAsset.findFirst({ where: { id: request.params.assetId, projectId: request.params.projectId, organizationId: user.organization.id } });
    if (!asset) return reply.status(404).send({ error: "asset_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: asset.storageKey }));
    await database.client.$transaction(async (tx) => {
      await tx.developmentAsset.delete({ where: { id: asset.id } });
      if (asset.isCover) {
        const replacement = await tx.developmentAsset.findFirst({ where: { projectId: asset.projectId, status: "READY", mimeType: { startsWith: "image/" } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
        if (replacement) await tx.developmentAsset.update({ where: { id: replacement.id }, data: { isCover: true } });
        await tx.developmentProject.update({ where: { id: asset.projectId }, data: { imageUrl: replacement ? `/api/crm/development-projects/${asset.projectId}/assets/${replacement.id}/content` : null } });
      }
    });
    return { deleted: true };
  });

  const developerParamsSchema = { type: "object", required: ["developerId"], properties: { developerId: { type: "string", format: "uuid" } } } as const;
  const coverBodySchema = { type: "object", additionalProperties: false, required: ["filename", "mimeType", "sizeBytes"], properties: {
    filename: { type: "string", minLength: 1, maxLength: 255 }, mimeType: { type: "string", enum: [...imageMimeTypes] },
    sizeBytes: { type: "integer", minimum: 1, maximum: maxImageBytes },
  } } as const;
  const developerCoverKey = (organizationId: string, developerId: string) => `crm/${organizationId}/developments/${developerId}/developer-cover`;

  app.post<{ Params: { developerId: string }; Body: { filename: string; mimeType: string; sizeBytes: number } }>("/development-developers/:developerId/cover/prepare", {
    schema: { params: developerParamsSchema, body: coverBodySchema },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden", message: "Изменять обложки может руководитель или администратор." });
    const developer = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found", message: "Застройщик не найден." });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured", message: "Cloudflare R2 не подключён на сервере." });
    const key = developerCoverKey(user.organization.id, developer.id);
    const uploadUrl = await getSignedUrl(r2.client, new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: request.body.mimeType }), { expiresIn: 300 });
    return { uploadUrl, expiresIn: 300 };
  });

  app.post<{ Params: { developerId: string }; Body: { filename: string; mimeType: string; sizeBytes: number } }>("/development-developers/:developerId/cover/finalize", {
    schema: { params: developerParamsSchema, body: coverBodySchema },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden" });
    const developer = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    try {
      const object = await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: developerCoverKey(user.organization.id, developer.id) }));
      if (object.ContentLength !== request.body.sizeBytes) return reply.status(409).send({ error: "upload_size_mismatch", message: "Размер файла не совпадает с исходным." });
    } catch { return reply.status(409).send({ error: "upload_missing", message: "Файл не найден в хранилище." }); }
    const coverReadyAt = new Date();
    await database.client.developmentDeveloper.update({ where: { id: developer.id }, data: { coverFilename: request.body.filename, coverMimeType: request.body.mimeType, coverSizeBytes: request.body.sizeBytes, coverReadyAt } });
    return { coverUrl: `/api/crm/development-developers/${developer.id}/cover/content?v=${coverReadyAt.getTime()}` };
  });

  app.get<{ Params: { developerId: string } }>("/development-developers/:developerId/cover/content", { schema: { params: developerParamsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const developer = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true, coverFilename: true, coverReadyAt: true } });
    if (!developer?.coverReadyAt || !r2) return reply.status(404).send({ error: "cover_not_found" });
    return reply.redirect(await getSignedUrl(r2.client, new GetObjectCommand({ Bucket: r2.bucket, Key: developerCoverKey(user.organization.id, developer.id), ResponseContentDisposition: `inline; filename="${encodeURIComponent(developer.coverFilename || "cover")}"` }), { expiresIn: 60 }));
  });

  app.delete<{ Params: { developerId: string } }>("/development-developers/:developerId/cover", { schema: { params: developerParamsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManage(user.organization.role)) return reply.status(403).send({ error: "forbidden" });
    const developer = await database.client.developmentDeveloper.findFirst({ where: { id: request.params.developerId, organizationId: user.organization.id }, select: { id: true, coverReadyAt: true } });
    if (!developer) return reply.status(404).send({ error: "developer_not_found" });
    if (developer.coverReadyAt && !r2) return reply.status(503).send({ error: "storage_not_configured", message: "Нельзя удалить обложку: хранилище R2 не подключено." });
    if (developer.coverReadyAt && r2) await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: developerCoverKey(user.organization.id, developer.id) }));
    await database.client.developmentDeveloper.update({ where: { id: developer.id }, data: { coverFilename: null, coverMimeType: null, coverSizeBytes: null, coverReadyAt: null } });
    return { deleted: true };
  });
}
