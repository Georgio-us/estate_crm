import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CreateDealPropertySelectionRequest,
  DealPropertySelectionRecord,
  UpdateDealPropertySelectionRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { dealScope } from "../auth/authorization.js";
import { requireUser } from "../auth/require-user.js";

function optionalText(value: string | null | undefined) {
  return value?.trim() || null;
}

function mapSelection(selection: {
  id: string; dealId: string; propertyId: string | null; catalogKey: string;
  status: "CANDIDATE" | "OFFERED"; title: string; subtitle: string | null;
  priceLabel: string | null; imageUrl: string | null; createdAt: Date; updatedAt: Date;
}): DealPropertySelectionRecord {
  return { ...selection, createdAt: selection.createdAt.toISOString(), updatedAt: selection.updatedAt.toISOString() };
}

const dealIdParams = { type: "object", required: ["dealId"], properties: { dealId: { type: "string", format: "uuid" } } } as const;
const selectionParams = { type: "object", required: ["dealId", "selectionId"], properties: { dealId: { type: "string", format: "uuid" }, selectionId: { type: "string", format: "uuid" } } } as const;

export async function registerPropertySelectionRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.get<{ Params: { dealId: string }; Reply: { selections: DealPropertySelectionRecord[] } | ApiErrorResponse }>("/deals/:dealId/property-selections", {
    schema: { params: dealIdParams },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const deal = await database.client.deal.findFirst({ where: { id: request.params.dealId, ...dealScope(user) }, select: { id: true } });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });
    const selections = await database.client.dealPropertySelection.findMany({ where: { dealId: deal.id }, orderBy: { updatedAt: "desc" } });
    return { selections: selections.map(mapSelection) };
  });

  app.post<{ Params: { dealId: string }; Body: CreateDealPropertySelectionRequest; Reply: { selection: DealPropertySelectionRecord } | ApiErrorResponse }>("/deals/:dealId/property-selections", {
    schema: {
      params: dealIdParams,
      body: { type: "object", additionalProperties: false, required: ["catalogKey", "title"], properties: {
        propertyId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
        catalogKey: { type: "string", minLength: 1, maxLength: 300 },
        title: { type: "string", minLength: 1, maxLength: 500 },
        subtitle: { anyOf: [{ type: "string", maxLength: 1_000 }, { type: "null" }] },
        priceLabel: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
        imageUrl: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
      } },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const deal = await database.client.deal.findFirst({ where: { id: request.params.dealId, ...dealScope(user) }, select: { id: true, contactId: true } });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });
    if (request.body.propertyId) {
      const property = await database.client.property.findFirst({ where: { id: request.body.propertyId, organizationId: user.organization.id }, select: { id: true } });
      if (!property) return reply.status(400).send({ error: "invalid_property", message: "Объект не найден в каталоге организации." });
    }
    const selection = await database.client.dealPropertySelection.upsert({
      where: { dealId_catalogKey: { dealId: deal.id, catalogKey: request.body.catalogKey } },
      create: {
        organizationId: user.organization.id, dealId: deal.id, propertyId: request.body.propertyId || null,
        catalogKey: request.body.catalogKey, title: request.body.title.trim(), subtitle: optionalText(request.body.subtitle),
        priceLabel: optionalText(request.body.priceLabel), imageUrl: optionalText(request.body.imageUrl),
      },
      update: {
        propertyId: request.body.propertyId || null, title: request.body.title.trim(), subtitle: optionalText(request.body.subtitle),
        priceLabel: optionalText(request.body.priceLabel), imageUrl: optionalText(request.body.imageUrl),
      },
    });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: deal.contactId, dealId: deal.id, authorId: user.id, category: "OBJECT", title: "Объект добавлен в подборку", description: selection.title } });
    return reply.status(201).send({ selection: mapSelection(selection) });
  });

  app.patch<{ Params: { dealId: string; selectionId: string }; Body: UpdateDealPropertySelectionRequest; Reply: { selection: DealPropertySelectionRecord } | ApiErrorResponse }>("/deals/:dealId/property-selections/:selectionId", {
    schema: { params: selectionParams, body: { type: "object", additionalProperties: false, required: ["status"], properties: { status: { type: "string", enum: ["CANDIDATE", "OFFERED"] } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.dealPropertySelection.findFirst({ where: { id: request.params.selectionId, dealId: request.params.dealId, organizationId: user.organization.id, deal: dealScope(user) }, include: { deal: { select: { contactId: true } } } });
    if (!existing) return reply.status(404).send({ error: "selection_not_found", message: "Объект не найден в подборке." });
    const selection = await database.client.dealPropertySelection.update({ where: { id: existing.id }, data: { status: request.body.status } });
    if (existing.status !== selection.status) await database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: existing.deal.contactId, dealId: existing.dealId, authorId: user.id, category: "OBJECT", title: selection.status === "OFFERED" ? "Объект предложен клиенту" : "Объект возвращён в кандидаты", description: selection.title } });
    return { selection: mapSelection(selection) };
  });

  app.delete<{ Params: { dealId: string; selectionId: string }; Reply: { ok: true } | ApiErrorResponse }>("/deals/:dealId/property-selections/:selectionId", {
    schema: { params: selectionParams },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.dealPropertySelection.findFirst({ where: { id: request.params.selectionId, dealId: request.params.dealId, organizationId: user.organization.id, deal: dealScope(user) }, include: { deal: { select: { contactId: true } } } });
    if (!existing) return reply.status(404).send({ error: "selection_not_found", message: "Объект не найден в подборке." });
    await database.client.dealPropertySelection.delete({ where: { id: existing.id } });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: existing.deal.contactId, dealId: existing.dealId, authorId: user.id, category: "OBJECT", title: "Объект удалён из подборки", description: existing.title } });
    return { ok: true };
  });
}
