import type { FastifyInstance } from "fastify";

import type { ApiErrorResponse, CreatePropertyRequest, PropertyListResponse, PropertyRecord, UpdatePropertyRequest } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";

function optionalText(value: string | null | undefined) {
  return value?.trim() || null;
}

function mapProperty(property: {
  id: string; number: number; title: string; address: string | null; district: string | null;
  category: "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL"; market: "PRIMARY" | "SECONDARY";
  operation: "SALE" | "RENT"; status: "AVAILABLE" | "RESERVED" | "SOLD";
  price: number | null; pricePerSquareMeter?: number | null; currency: "USD" | "EUR" | "UAH"; rooms: string | null; area: number | null; floor: number | null;
  priceRaw?: string | null; areaRaw?: string | null;
  totalFloors: number | null; landArea: number | null; project: string | null; developer: string | null;
  description: string | null; imageUrl: string | null; createdAt: Date; updatedAt: Date;
  buildingLabel?: string | null; unitDetail?: string | null; subtype?: string | null; condition?: string | null;
  documentNotes?: string | null; ownerName?: string | null; ownerContacts?: string | null;
  assigneeId?: string | null; assignmentNote?: string | null; sourceSheet?: string | null; sourceRow?: number | null;
  assignee?: { name: string } | null; photos?: Array<{ id: string; isCover: boolean; sortOrder: number }>;
}): PropertyRecord {
  return {
    id: property.id, title: property.title, address: property.address, district: property.district,
    category: property.category, market: property.market, operation: property.operation, status: property.status,
    price: property.price, pricePerSquareMeter: property.pricePerSquareMeter ?? null, priceRaw: property.priceRaw ?? null, currency: property.currency, rooms: property.rooms, area: property.area, areaRaw: property.areaRaw ?? null,
    floor: property.floor, totalFloors: property.totalFloors, landArea: property.landArea,
    project: property.project, developer: property.developer, description: property.description,
    imageUrl: property.photos?.length ? `/api/crm/properties/${property.id}/photos/${property.photos.find((photo) => photo.isCover)?.id ?? property.photos[0]?.id}/content` : property.imageUrl,
    buildingLabel: property.buildingLabel ?? null, unitDetail: property.unitDetail ?? null,
    subtype: property.subtype ?? null, condition: property.condition ?? null,
    documentNotes: property.documentNotes ?? null, ownerName: property.ownerName ?? null,
    ownerContacts: property.ownerContacts ?? null, assigneeId: property.assigneeId ?? null,
    assigneeName: property.assignee?.name ?? null, assignmentNote: property.assignmentNote ?? null,
    sourceSheet: property.sourceSheet ?? null, sourceRow: property.sourceRow ?? null,
    photosCount: property.photos?.length ?? 0,
    code: `OD-${property.number}`,
    createdAt: property.createdAt.toISOString(),
    updatedAt: property.updatedAt.toISOString(),
  };
}

const propertyFields = {
  title: { type: "string", minLength: 1, maxLength: 500 },
  address: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
  district: { anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }] },
  category: { type: "string", enum: ["APARTMENT", "HOUSE", "LAND", "COMMERCIAL"] },
  market: { type: "string", enum: ["PRIMARY", "SECONDARY"] },
  operation: { type: "string", enum: ["SALE", "RENT"] },
  status: { type: "string", enum: ["AVAILABLE", "RESERVED", "SOLD"] },
  price: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
  pricePerSquareMeter: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
  currency: { type: "string", enum: ["USD", "EUR", "UAH"] },
  rooms: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
  area: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
  floor: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  totalFloors: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  landArea: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
  project: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  developer: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  description: { anyOf: [{ type: "string", maxLength: 10_000 }, { type: "null" }] },
  imageUrl: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
  buildingLabel: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  unitDetail: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  subtype: { anyOf: [{ type: "string", maxLength: 160 }, { type: "null" }] },
  condition: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
  documentNotes: { anyOf: [{ type: "string", maxLength: 10_000 }, { type: "null" }] },
  ownerName: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  ownerContacts: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
  assigneeId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
  assignmentNote: { anyOf: [{ type: "string", maxLength: 500 }, { type: "null" }] },
} as const;

function propertyData(body: CreatePropertyRequest | UpdatePropertyRequest) {
  return {
    ...(body.title !== undefined ? { title: body.title.trim() } : {}),
    ...(body.address !== undefined ? { address: optionalText(body.address) } : {}),
    ...(body.district !== undefined ? { district: optionalText(body.district) } : {}),
    ...(body.category !== undefined ? { category: body.category } : {}),
    ...(body.market !== undefined ? { market: body.market } : {}),
    ...(body.operation !== undefined ? { operation: body.operation } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.price !== undefined ? { price: body.price } : {}),
    ...(body.pricePerSquareMeter !== undefined ? { pricePerSquareMeter: body.pricePerSquareMeter } : {}),
    ...(body.currency !== undefined ? { currency: body.currency } : {}),
    ...(body.rooms !== undefined ? { rooms: optionalText(body.rooms) } : {}),
    ...(body.area !== undefined ? { area: body.area } : {}),
    ...(body.floor !== undefined ? { floor: body.floor } : {}),
    ...(body.totalFloors !== undefined ? { totalFloors: body.totalFloors } : {}),
    ...(body.landArea !== undefined ? { landArea: body.landArea } : {}),
    ...(body.project !== undefined ? { project: optionalText(body.project) } : {}),
    ...(body.developer !== undefined ? { developer: optionalText(body.developer) } : {}),
    ...(body.description !== undefined ? { description: optionalText(body.description) } : {}),
    ...(body.imageUrl !== undefined ? { imageUrl: optionalText(body.imageUrl) } : {}),
    ...(body.buildingLabel !== undefined ? { buildingLabel: optionalText(body.buildingLabel) } : {}),
    ...(body.unitDetail !== undefined ? { unitDetail: optionalText(body.unitDetail) } : {}),
    ...(body.subtype !== undefined ? { subtype: optionalText(body.subtype) } : {}),
    ...(body.condition !== undefined ? { condition: optionalText(body.condition) } : {}),
    ...(body.documentNotes !== undefined ? { documentNotes: optionalText(body.documentNotes) } : {}),
    ...(body.ownerName !== undefined ? { ownerName: optionalText(body.ownerName) } : {}),
    ...(body.ownerContacts !== undefined ? { ownerContacts: optionalText(body.ownerContacts) } : {}),
    ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId } : {}),
    ...(body.assignmentNote !== undefined ? { assignmentNote: optionalText(body.assignmentNote) } : {}),
  };
}

async function activeAssignee(database: DatabaseConnection, organizationId: string, assigneeId: string) {
  return database.client.membership.findFirst({ where: { organizationId, userId: assigneeId, status: "ACTIVE" }, select: { userId: true } });
}

export async function registerPropertyRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: PropertyListResponse | ApiErrorResponse }>("/properties", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const properties = await database.client.property.findMany({ where: { organizationId: user.organization.id }, include: { assignee: { select: { name: true } }, photos: { where: { status: "READY" }, select: { id: true, isCover: true, sortOrder: true }, orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }] } }, orderBy: { updatedAt: "desc" }, take: 500 });
    return { properties: properties.map(mapProperty), total: properties.length };
  });

  app.post<{ Body: CreatePropertyRequest; Reply: { property: PropertyRecord } | ApiErrorResponse }>("/properties", {
    schema: { body: { type: "object", additionalProperties: false, required: ["title", "category", "market"], properties: propertyFields } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (request.body.assigneeId && !await activeAssignee(database, user.organization.id, request.body.assigneeId)) return reply.status(400).send({ error: "invalid_assignee", message: "Ответственный должен быть активным сотрудником CRM." });
    const property = await database.client.property.create({ data: { ...propertyData(request.body), organizationId: user.organization.id, title: request.body.title.trim(), category: request.body.category, market: request.body.market }, include: { assignee: { select: { name: true } }, photos: { where: { status: "READY" }, select: { id: true, isCover: true, sortOrder: true } } } });
    return reply.status(201).send({ property: mapProperty(property) });
  });

  app.patch<{ Params: { propertyId: string }; Body: UpdatePropertyRequest; Reply: { property: PropertyRecord } | ApiErrorResponse }>("/properties/:propertyId", {
    schema: { params: { type: "object", required: ["propertyId"], properties: { propertyId: { type: "string", format: "uuid" } } }, body: { type: "object", additionalProperties: false, minProperties: 1, properties: propertyFields } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.property.findFirst({ where: { id: request.params.propertyId, organizationId: user.organization.id }, select: { id: true, sourceSheet: true } });
    if (!existing) return reply.status(404).send({ error: "property_not_found", message: "Объект не найден." });
    if (existing.sourceSheet && request.body.market === "PRIMARY") return reply.status(400).send({ error: "imported_property_market", message: "Объект из базы собственников остаётся во вторичной недвижимости." });
    if (request.body.assigneeId && !await activeAssignee(database, user.organization.id, request.body.assigneeId)) return reply.status(400).send({ error: "invalid_assignee", message: "Ответственный должен быть активным сотрудником CRM." });
    const property = await database.client.property.update({ where: { id: existing.id }, data: propertyData(request.body), include: { assignee: { select: { name: true } }, photos: { where: { status: "READY" }, select: { id: true, isCover: true, sortOrder: true } } } });
    if (request.body.assigneeId !== undefined) await database.client.propertyEvent.create({ data: { organizationId: user.organization.id, propertyId: existing.id, actorId: user.id, title: request.body.assigneeId ? "Назначен ответственный за объект" : "Ответственный за объект снят", description: property.assignee?.name ?? property.assignmentNote } });
    return { property: mapProperty(property) };
  });
}
