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
  price: number; currency: "USD" | "EUR"; rooms: string | null; area: number; floor: number | null;
  totalFloors: number | null; landArea: number | null; project: string | null; developer: string | null;
  description: string | null; imageUrl: string | null; createdAt: Date; updatedAt: Date;
}): PropertyRecord {
  return {
    ...property,
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
  price: { type: "number", minimum: 0 },
  currency: { type: "string", enum: ["USD", "EUR"] },
  rooms: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
  area: { type: "number", minimum: 0 },
  floor: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  totalFloors: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  landArea: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
  project: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  developer: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  description: { anyOf: [{ type: "string", maxLength: 10_000 }, { type: "null" }] },
  imageUrl: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
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
  };
}

export async function registerPropertyRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: PropertyListResponse | ApiErrorResponse }>("/properties", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const properties = await database.client.property.findMany({ where: { organizationId: user.organization.id }, orderBy: { updatedAt: "desc" }, take: 500 });
    return { properties: properties.map(mapProperty), total: properties.length };
  });

  app.post<{ Body: CreatePropertyRequest; Reply: { property: PropertyRecord } | ApiErrorResponse }>("/properties", {
    schema: { body: { type: "object", additionalProperties: false, required: ["title", "category", "market"], properties: propertyFields } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const property = await database.client.property.create({ data: { ...propertyData(request.body), organizationId: user.organization.id, title: request.body.title.trim(), category: request.body.category, market: request.body.market } });
    return reply.status(201).send({ property: mapProperty(property) });
  });

  app.patch<{ Params: { propertyId: string }; Body: UpdatePropertyRequest; Reply: { property: PropertyRecord } | ApiErrorResponse }>("/properties/:propertyId", {
    schema: { params: { type: "object", required: ["propertyId"], properties: { propertyId: { type: "string", format: "uuid" } } }, body: { type: "object", additionalProperties: false, minProperties: 1, properties: propertyFields } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.property.findFirst({ where: { id: request.params.propertyId, organizationId: user.organization.id }, select: { id: true } });
    if (!existing) return reply.status(404).send({ error: "property_not_found", message: "Объект не найден." });
    const property = await database.client.property.update({ where: { id: existing.id }, data: propertyData(request.body) });
    return { property: mapProperty(property) };
  });
}
