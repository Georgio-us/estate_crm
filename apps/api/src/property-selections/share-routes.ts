import { randomBytes } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CreatePropertySelectionShareRequest,
  PropertySelectionShareRecord,
  PublicPropertySelectionShareRecord,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { dealScope } from "../auth/authorization.js";
import type { ApiConfig } from "../config.js";
import { requireUser } from "../auth/require-user.js";
import { propertyPhotoDownloadUrl } from "../properties/photo-routes.js";

const dealIdParams = { type: "object", required: ["dealId"], properties: { dealId: { type: "string", format: "uuid" } } } as const;
const shareParams = { type: "object", required: ["dealId", "shareId"], properties: { dealId: { type: "string", format: "uuid" }, shareId: { type: "string", format: "uuid" } } } as const;
const tokenParams = { type: "object", required: ["token"], properties: { token: { type: "string", pattern: "^[A-Za-z0-9_-]{40,64}$" } } } as const;
const publicPhotoParams = { type: "object", required: ["token", "itemId", "photoId"], properties: {
  token: { type: "string", pattern: "^[A-Za-z0-9_-]{40,64}$" },
  itemId: { type: "string", format: "uuid" },
  photoId: { type: "string", format: "uuid" },
} } as const;

type ShareWithItems = {
  id: string;
  publicToken: string;
  status: "CREATED" | "SENT" | "OPENED" | "REVOKED";
  expiresAt: Date;
  sentAt: Date | null;
  openedAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
  items: Array<{
    id: string;
    propertySelectionId: string | null;
    source: "CRM" | "VIA" | "DEMO";
    title: string;
    subtitle: string | null;
    priceLabel: string | null;
    imageUrl: string | null;
    sortOrder: number;
  }>;
};

function effectiveStatus(share: ShareWithItems): PropertySelectionShareRecord["status"] {
  if (share.status !== "REVOKED" && share.expiresAt.getTime() <= Date.now()) return "EXPIRED";
  return share.status;
}

function mapShare(share: ShareWithItems): PropertySelectionShareRecord {
  return {
    id: share.id,
    status: effectiveStatus(share),
    publicPath: `/s/${share.publicToken}`,
    expiresAt: share.expiresAt.toISOString(),
    sentAt: share.sentAt?.toISOString() || null,
    openedAt: share.openedAt?.toISOString() || null,
    revokedAt: share.revokedAt?.toISOString() || null,
    viewCount: share.viewCount,
    createdAt: share.createdAt.toISOString(),
    items: share.items.map((item) => ({ ...item })),
  };
}

function sourceFromCatalogKey(catalogKey: string, propertyId: string | null): "CRM" | "VIA" | "DEMO" {
  if (catalogKey.startsWith("via:")) return "VIA";
  if (propertyId) return "CRM";
  return "DEMO";
}

export async function registerPropertySelectionShareRoutes(app: FastifyInstance, database: DatabaseConnection, config: ApiConfig): Promise<void> {
  app.get<{ Params: { dealId: string }; Reply: { shares: PropertySelectionShareRecord[] } | ApiErrorResponse }>("/deals/:dealId/property-shares", {
    schema: { params: dealIdParams },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const deal = await database.client.deal.findFirst({ where: { id: request.params.dealId, ...dealScope(user) }, select: { id: true } });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });
    const shares = await database.client.propertySelectionShare.findMany({ where: { dealId: deal.id }, include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } });
    return { shares: shares.map((share) => mapShare(share as ShareWithItems)) };
  });

  app.post<{ Params: { dealId: string }; Body: CreatePropertySelectionShareRequest; Reply: { share: PropertySelectionShareRecord } | ApiErrorResponse }>("/deals/:dealId/property-shares", {
    schema: {
      params: dealIdParams,
      body: { type: "object", additionalProperties: false, required: ["selectionIds"], properties: { selectionIds: { type: "array", minItems: 1, maxItems: 30, uniqueItems: true, items: { type: "string", format: "uuid" } } } },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const deal = await database.client.deal.findFirst({
      where: { id: request.params.dealId, ...dealScope(user) },
      select: { id: true, contactId: true },
    });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    const selections = await database.client.dealPropertySelection.findMany({
      where: { id: { in: request.body.selectionIds }, dealId: deal.id, organizationId: user.organization.id },
      include: { property: { select: { archivedAt: true, status: true } } },
    });
    if (selections.length !== request.body.selectionIds.length) {
      return reply.status(400).send({ error: "invalid_selection", message: "Часть объектов больше не доступна в этой подборке." });
    }
    const byId = new Map(selections.map((selection) => [selection.id, selection]));
    const orderedSelections = request.body.selectionIds.map((id) => byId.get(id)!);
    if (orderedSelections.some((selection) => selection.property && (selection.property.archivedAt || selection.property.status !== "AVAILABLE"))) {
      return reply.status(409).send({ error: "property_unavailable", message: "В подборке есть архивный или недоступный объект. Удалите его перед созданием ссылки." });
    }
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    await database.client.propertySelectionShare.updateMany({
      where: { dealId: deal.id, organizationId: user.organization.id, status: "CREATED" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const share = await database.client.propertySelectionShare.create({
      data: {
        organizationId: user.organization.id,
        dealId: deal.id,
        contactId: deal.contactId,
        createdById: user.id,
        publicToken: randomBytes(32).toString("base64url"),
        expiresAt,
        items: {
          create: orderedSelections.map((selection, index) => ({
            propertySelectionId: selection.id,
            propertyId: selection.propertyId,
            source: sourceFromCatalogKey(selection.catalogKey, selection.propertyId),
            externalId: selection.catalogKey.includes(":") ? selection.catalogKey.slice(selection.catalogKey.indexOf(":") + 1) : null,
            title: selection.title,
            subtitle: selection.subtitle,
            priceLabel: selection.priceLabel,
            imageUrl: selection.imageUrl,
            sortOrder: index,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: deal.contactId, dealId: deal.id, authorId: user.id, category: "OBJECT", title: "Создана ссылка на подборку", description: `${orderedSelections.length} объектов · действует 30 дней` } });
    return reply.status(201).send({ share: mapShare(share as ShareWithItems) });
  });

  app.post<{ Params: { dealId: string; shareId: string }; Reply: { share: PropertySelectionShareRecord } | ApiErrorResponse }>("/deals/:dealId/property-shares/:shareId/sent", {
    schema: { params: shareParams },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.propertySelectionShare.findFirst({
      where: { id: request.params.shareId, dealId: request.params.dealId, organizationId: user.organization.id, deal: dealScope(user) },
      include: { items: { orderBy: { sortOrder: "asc" } }, deal: { select: { contactId: true } } },
    });
    if (!existing) return reply.status(404).send({ error: "share_not_found", message: "Ссылка на подборку не найдена." });
    if (existing.status === "REVOKED" || existing.expiresAt.getTime() <= Date.now()) return reply.status(409).send({ error: "share_unavailable", message: "Эта ссылка уже недоступна. Создайте новую." });
    const now = new Date();
    const selectionIds = existing.items.map((item) => item.propertySelectionId).filter((id): id is string => Boolean(id));
    await database.client.$transaction([
      database.client.propertySelectionShare.update({ where: { id: existing.id }, data: { status: existing.status === "OPENED" ? "OPENED" : "SENT", sentAt: existing.sentAt || now } }),
      database.client.dealPropertySelection.updateMany({ where: { id: { in: selectionIds }, dealId: existing.dealId }, data: { status: "OFFERED" } }),
      database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: existing.deal.contactId, dealId: existing.dealId, authorId: user.id, category: "OBJECT", title: "Подборка отправлена клиенту", description: `${existing.items.length} объектов` } }),
    ]);
    const updated = await database.client.propertySelectionShare.findUniqueOrThrow({ where: { id: existing.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    return { share: mapShare(updated as ShareWithItems) };
  });

  app.post<{ Params: { dealId: string; shareId: string }; Reply: { share: PropertySelectionShareRecord } | ApiErrorResponse }>("/deals/:dealId/property-shares/:shareId/revoke", {
    schema: { params: shareParams },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.propertySelectionShare.findFirst({ where: { id: request.params.shareId, dealId: request.params.dealId, organizationId: user.organization.id, deal: dealScope(user) }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "share_not_found", message: "Ссылка на подборку не найдена." });
    const share = await database.client.propertySelectionShare.update({ where: { id: existing.id }, data: { status: "REVOKED", revokedAt: new Date() }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    return { share: mapShare(share as ShareWithItems) };
  });

  app.get<{ Params: { token: string }; Reply: PublicPropertySelectionShareRecord | ApiErrorResponse }>("/public/property-shares/:token", {
    schema: { params: tokenParams },
  }, async (request, reply) => {
    const share = await database.client.propertySelectionShare.findUnique({
      where: { publicToken: request.params.token },
      include: {
        organization: { select: { name: true, companyName: true } },
        contact: { select: { name: true } },
        deal: { select: { assignee: { select: { name: true, email: true, phone: true } } } },
        items: {
          orderBy: { sortOrder: "asc" },
          include: { property: { select: {
            address: true, district: true, category: true, operation: true, area: true, rooms: true,
            floor: true, totalFloors: true, landArea: true, description: true,
            photos: { where: { status: "READY" }, orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } },
          } } },
        },
      },
    });
    if (!share) return reply.status(404).send({ error: "share_not_found", message: "Подборка не найдена." });
    if (share.status === "REVOKED") return reply.status(410).send({ error: "share_revoked", message: "Эта подборка больше недоступна." });
    if (share.expiresAt.getTime() <= Date.now()) return reply.status(410).send({ error: "share_expired", message: "Срок действия этой подборки истёк." });
    const manager = share.deal.assignee;
    return {
      status: "AVAILABLE",
      organizationName: share.organization.companyName || share.organization.name,
      clientName: share.contact?.name || null,
      manager: manager ? { name: manager.name, email: manager.email, phone: manager.phone } : null,
      expiresAt: share.expiresAt.toISOString(),
      items: share.items.map((item) => ({
        id: item.id, title: item.title, subtitle: item.subtitle, priceLabel: item.priceLabel, imageUrl: item.imageUrl,
        address: item.property?.address ?? null, district: item.property?.district ?? null,
        category: item.property?.category ?? null, operation: item.property?.operation ?? null,
        area: item.property?.area ?? null, rooms: item.property?.rooms ?? null,
        floor: item.property?.floor ?? null, totalFloors: item.property?.totalFloors ?? null,
        landArea: item.property?.landArea ?? null, description: item.property?.description ?? null,
        photos: item.property?.photos.map((photo) => ({ id: photo.id, url: `/api/public/property-shares/${share.publicToken}/items/${item.id}/photos/${photo.id}` })) ?? [],
      })),
    };
  });

  app.get<{ Params: { token: string; itemId: string; photoId: string } }>("/public/property-shares/:token/items/:itemId/photos/:photoId", {
    schema: { params: publicPhotoParams },
  }, async (request, reply) => {
    const share = await database.client.propertySelectionShare.findUnique({
      where: { publicToken: request.params.token },
      select: { id: true, organizationId: true, status: true, expiresAt: true },
    });
    if (!share || share.status === "REVOKED" || share.expiresAt.getTime() <= Date.now()) return reply.status(404).send({ error: "photo_not_found" });
    const item = await database.client.propertySelectionShareItem.findFirst({
      where: { id: request.params.itemId, shareId: share.id, propertyId: { not: null } },
      select: { propertyId: true },
    });
    if (!item?.propertyId) return reply.status(404).send({ error: "photo_not_found" });
    const photo = await database.client.propertyPhoto.findFirst({
      where: { id: request.params.photoId, organizationId: share.organizationId, propertyId: item.propertyId, status: "READY" },
      select: { storageKey: true },
    });
    if (!photo) return reply.status(404).send({ error: "photo_not_found" });
    const url = await propertyPhotoDownloadUrl(config, photo.storageKey);
    if (!url) return reply.status(503).send({ error: "storage_not_configured" });
    return reply.redirect(url);
  });

  app.post<{ Params: { token: string }; Reply: { ok: true } | ApiErrorResponse }>("/public/property-shares/:token/open", {
    schema: { params: tokenParams },
  }, async (request, reply) => {
    const share = await database.client.propertySelectionShare.findUnique({ where: { publicToken: request.params.token }, select: { id: true, status: true, expiresAt: true } });
    if (!share) return reply.status(404).send({ error: "share_not_found", message: "Подборка не найдена." });
    if (share.status === "REVOKED" || share.expiresAt.getTime() <= Date.now()) return reply.status(410).send({ error: "share_unavailable", message: "Подборка больше недоступна." });
    const now = new Date();
    await database.client.propertySelectionShare.update({ where: { id: share.id }, data: { status: "OPENED", openedAt: now, lastViewedAt: now, viewCount: { increment: 1 } } });
    return { ok: true };
  });
}
