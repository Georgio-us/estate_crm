import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FastifyInstance } from "fastify";
import type { DatabaseConnection } from "@estate-crm/database";
import type { ApiConfig } from "../config.js";
import { requireUser } from "../auth/require-user.js";

const softLimit = 15 * 1024 * 1024;

function storage(config: ApiConfig) {
  if (!config.r2AccountId || !config.r2Bucket || !config.r2AccessKeyId || !config.r2SecretAccessKey) return null;
  return { bucket: config.r2Bucket, client: new S3Client({ region: "auto", endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.r2AccessKeyId, secretAccessKey: config.r2SecretAccessKey } }) };
}

export async function registerPropertyPhotoRoutes(app: FastifyInstance, database: DatabaseConnection, config: ApiConfig) {
  const r2 = storage(config);
  const paramsSchema = { type: "object", required: ["propertyId"], properties: { propertyId: { type: "string", format: "uuid" }, photoId: { type: "string", format: "uuid" } } } as const;
  async function propertyForUser(propertyId: string, organizationId: string) {
    return database.client.property.findFirst({ where: { id: propertyId, organizationId }, select: { id: true } });
  }
  app.get<{ Params: { propertyId: string } }>("/properties/:propertyId/photos", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!await propertyForUser(request.params.propertyId, user.organization.id)) return reply.status(404).send({ error: "property_not_found" });
    const [photos, events] = await Promise.all([
      database.client.propertyPhoto.findMany({ where: { organizationId: user.organization.id, propertyId: request.params.propertyId, status: "READY" }, orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }] }),
      database.client.propertyEvent.findMany({ where: { organizationId: user.organization.id, propertyId: request.params.propertyId }, include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    return { photos: photos.map((photo) => ({ id: photo.id, filename: photo.filename, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes, isCover: photo.isCover, sortOrder: photo.sortOrder, url: `/api/crm/properties/${request.params.propertyId}/photos/${photo.id}/content`, createdAt: photo.createdAt.toISOString() })), events: events.map((event) => ({ id: event.id, title: event.title, description: event.description, actorName: event.actor?.name ?? null, createdAt: event.createdAt.toISOString() })) };
  });
  app.post<{ Params: { propertyId: string }; Body: { filename: string; mimeType: string; sizeBytes: number; confirmOversize?: boolean } }>("/properties/:propertyId/photos/prepare", { schema: { params: paramsSchema, body: { type: "object", additionalProperties: false, required: ["filename", "mimeType", "sizeBytes"], properties: { filename: { type: "string", minLength: 1, maxLength: 255 }, mimeType: { type: "string", enum: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"] }, sizeBytes: { type: "integer", minimum: 1, maximum: 2_000_000_000 }, confirmOversize: { type: "boolean" } } } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!await propertyForUser(request.params.propertyId, user.organization.id)) return reply.status(404).send({ error: "property_not_found" });
    if (request.body.sizeBytes > softLimit && !request.body.confirmOversize) return reply.status(409).send({ error: "oversize_confirmation_required", message: "Подтвердите загрузку фото больше 15 МБ.", sizeBytes: request.body.sizeBytes });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured", message: "Хранилище фотографий пока не подключено. Настройте Cloudflare R2 на сервере." });
    const key = `crm/${user.organization.id}/properties/${request.params.propertyId}/${randomUUID()}`;
    const photo = await database.client.propertyPhoto.create({ data: { organizationId: user.organization.id, propertyId: request.params.propertyId, uploadedById: user.id, storageKey: key, filename: request.body.filename, mimeType: request.body.mimeType, sizeBytes: request.body.sizeBytes } });
    const uploadUrl = await getSignedUrl(r2.client, new PutObjectCommand({ Bucket: r2.bucket, Key: key, ContentType: request.body.mimeType }), { expiresIn: 300 });
    return reply.status(201).send({ photoId: photo.id, uploadUrl, expiresIn: 300 });
  });
  app.post<{ Params: { propertyId: string; photoId: string } }>("/properties/:propertyId/photos/:photoId/finalize", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const photo = await database.client.propertyPhoto.findFirst({ where: { id: request.params.photoId, propertyId: request.params.propertyId, organizationId: user.organization.id } });
    if (!photo) return reply.status(404).send({ error: "photo_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    if (photo.status === "READY") return { photoId: photo.id, status: "READY" };
    let size: number | undefined;
    try { size = (await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: photo.storageKey }))).ContentLength; }
    catch { return reply.status(409).send({ error: "upload_missing", message: "Файл не найден в хранилище. Повторите загрузку." }); }
    if (size !== photo.sizeBytes) return reply.status(409).send({ error: "upload_size_mismatch", message: "Размер загруженного файла не совпадает с исходным." });
    await database.client.$transaction(async (tx) => {
      const coverCount = await tx.propertyPhoto.count({ where: { organizationId: user.organization.id, propertyId: photo.propertyId, status: "READY", isCover: true } });
      await tx.propertyPhoto.update({ where: { id: photo.id }, data: { status: "READY", readyAt: new Date(), isCover: coverCount === 0 } });
      await tx.propertyEvent.create({ data: { organizationId: user.organization.id, propertyId: photo.propertyId, actorId: user.id, title: "Добавлено фото", description: `${photo.filename} · ${(photo.sizeBytes / 1024 / 1024).toFixed(2)} МБ (${photo.sizeBytes} байт)` } });
    });
    return { photoId: photo.id, status: "READY" };
  });
  app.get<{ Params: { propertyId: string; photoId: string } }>("/properties/:propertyId/photos/:photoId/content", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const photo = await database.client.propertyPhoto.findFirst({ where: { id: request.params.photoId, propertyId: request.params.propertyId, organizationId: user.organization.id, status: "READY" } });
    if (!photo) return reply.status(404).send({ error: "photo_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    const url = await getSignedUrl(r2.client, new GetObjectCommand({ Bucket: r2.bucket, Key: photo.storageKey }), { expiresIn: 60 });
    return reply.redirect(url);
  });
  app.delete<{ Params: { propertyId: string; photoId: string } }>("/properties/:propertyId/photos/:photoId", { schema: { params: paramsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const photo = await database.client.propertyPhoto.findFirst({ where: { id: request.params.photoId, propertyId: request.params.propertyId, organizationId: user.organization.id } });
    if (!photo) return reply.status(404).send({ error: "photo_not_found" });
    if (!r2) return reply.status(503).send({ error: "storage_not_configured" });
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: photo.storageKey }));
    await database.client.propertyPhoto.delete({ where: { id: photo.id } });
    if (photo.status === "READY") await database.client.propertyEvent.create({ data: { organizationId: user.organization.id, propertyId: photo.propertyId, actorId: user.id, title: "Удалено фото", description: `${photo.filename} · ${(photo.sizeBytes / 1024 / 1024).toFixed(2)} МБ` } });
    return { deleted: true };
  });
}
