import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CreateDealRequest,
  MoveDealRequest,
  PipelineDealRecord,
  PipelineResponse,
  UpdateDealRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";

const defaultStages = [
  { title: "Неразобранные", color: "#d6a835", position: 0 },
  { title: "Новый лид", color: "#d98245", position: 1 },
  { title: "Не дозвонились", color: "#5d8fc9", position: 2 },
  { title: "В работе", color: "#8b6cc2", position: 3 },
  { title: "Подбор объектов", color: "#4a9d75", position: 4 },
];

function optionalText(value: string | undefined): string | null {
  return value?.trim() || null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits || null;
}

function mapDeal(deal: {
  id: string;
  number: number;
  request: string;
  budget: string | null;
  operation: "PURCHASE" | "RENT" | "SALE";
  propertyType: string | null;
  district: string | null;
  rooms: string | null;
  source: "META" | "WEBSITE" | "MANUAL";
  position: number;
  createdAt: Date;
  updatedAt: Date;
  contact: { id: string; name: string; phone: string | null };
  assignee: { id: string; name: string } | null;
  title: string;
  comment: string | null;
}): PipelineDealRecord {
  return {
    ...deal,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
  };
}

async function ensureDefaultPipeline(database: DatabaseConnection, organizationId: string) {
  const existing = await database.client.pipeline.findFirst({
    where: { organizationId, isDefault: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return database.client.pipeline.create({
    data: {
      organizationId,
      name: "Продажа недвижимости",
      isDefault: true,
      stages: { create: defaultStages },
    },
  });
}

export async function registerPipelineRoutes(
  app: FastifyInstance,
  database: DatabaseConnection,
): Promise<void> {
  app.get<{ Reply: PipelineResponse | ApiErrorResponse }>("/pipeline", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const pipeline = await ensureDefaultPipeline(database, user.organization.id);
    const stages = await database.client.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { position: "asc" },
      include: {
        deals: {
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          include: {
            contact: { select: { id: true, name: true, phone: true } },
            assignee: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      pipeline: {
        id: pipeline.id,
        name: pipeline.name,
        stages: stages.map((stage) => ({
          id: stage.id,
          title: stage.title,
          color: stage.color,
          position: stage.position,
          deals: stage.deals.map(mapDeal),
        })),
      },
    };
  });

  app.post<{
    Body: CreateDealRequest;
    Reply: { deal: PipelineDealRecord; stageId: string } | ApiErrorResponse;
  }>("/deals", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["stageId"],
        properties: {
          stageId: { type: "string", format: "uuid" },
          contactId: { type: "string", format: "uuid" },
          contactName: { type: "string", minLength: 1, maxLength: 200 },
          phone: { type: "string", maxLength: 50 },
          assigneeId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
          title: { type: "string", maxLength: 300 },
          request: { type: "string", maxLength: 1_000 },
          budget: { type: "string", maxLength: 100 },
          operation: { type: "string", enum: ["PURCHASE", "RENT", "SALE"] },
          propertyType: { type: "string", maxLength: 100 },
          district: { type: "string", maxLength: 100 },
          rooms: { type: "string", maxLength: 30 },
          source: { type: "string", enum: ["META", "WEBSITE", "MANUAL"] },
          comment: { type: "string", maxLength: 5_000 },
        },
        anyOf: [{ required: ["contactId"] }, { required: ["contactName"] }],
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const stage = await database.client.pipelineStage.findFirst({
      where: { id: request.body.stageId, pipeline: { organizationId: user.organization.id } },
      include: { pipeline: true },
    });
    if (!stage) return reply.status(400).send({ error: "invalid_stage", message: "Этап воронки не найден." });

    if (request.body.assigneeId) {
      const membership = await database.client.membership.findUnique({
        where: { organizationId_userId: { organizationId: user.organization.id, userId: request.body.assigneeId } },
      });
      if (!membership || membership.status !== "ACTIVE") {
        return reply.status(400).send({ error: "invalid_assignee", message: "Ответственный не входит в эту организацию." });
      }
    }

    let contact = request.body.contactId ? await database.client.contact.findFirst({
      where: { id: request.body.contactId, organizationId: user.organization.id },
    }) : null;

    if (!contact && request.body.contactId) {
      return reply.status(400).send({ error: "invalid_contact", message: "Контакт не найден." });
    }

    if (!contact) {
      const phone = optionalText(request.body.phone);
      const normalizedPhone = normalizePhone(phone);
      contact = normalizedPhone ? await database.client.contact.findFirst({
        where: { organizationId: user.organization.id, normalizedPhone },
      }) : null;
      if (contact) {
        return reply.status(409).send({
          error: "contact_already_exists",
          message: `Контакт «${contact.name}» с таким телефоном уже существует. Выберите его в поле «Контакт из базы».`,
        });
      }
      if (!contact) {
        contact = await database.client.contact.create({
          data: {
            organizationId: user.organization.id,
            name: request.body.contactName!.trim(),
            phone,
            normalizedPhone,
            source: request.body.source ?? "MANUAL",
            assigneeId: request.body.assigneeId ?? null,
          },
        });
      }
    }

    const deal = await database.client.deal.create({
      data: {
        organizationId: user.organization.id,
        pipelineId: stage.pipelineId,
        stageId: stage.id,
        contactId: contact.id,
        assigneeId: request.body.assigneeId ?? null,
        title: optionalText(request.body.title) ?? optionalText(request.body.request) ?? contact.name,
        request: optionalText(request.body.request) ?? "",
        budget: optionalText(request.body.budget),
        comment: optionalText(request.body.comment),
        operation: request.body.operation ?? "PURCHASE",
        propertyType: optionalText(request.body.propertyType),
        district: optionalText(request.body.district),
        rooms: optionalText(request.body.rooms),
        source: request.body.source ?? "MANUAL",
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: contact.id,
        dealId: deal.id,
        authorId: user.id,
        category: "SOURCE",
        title: "Сделка создана",
        description: request.body.source === "META" ? "Источник Meta" : request.body.source === "WEBSITE" ? "Источник: сайт" : "Добавлена вручную",
      },
    });

    return reply.status(201).send({ deal: mapDeal(deal), stageId: stage.id });
  });

  app.patch<{
    Params: { dealId: string };
    Body: UpdateDealRequest;
    Reply: { deal: PipelineDealRecord; stageId: string } | ApiErrorResponse;
  }>("/deals/:dealId", {
    schema: {
      params: { type: "object", required: ["dealId"], properties: { dealId: { type: "string", format: "uuid" } } },
      body: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          stageId: { type: "string", format: "uuid" },
          assigneeId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
          title: { type: "string", minLength: 1, maxLength: 300 },
          request: { type: "string", maxLength: 1_000 },
          budget: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          operation: { type: "string", enum: ["PURCHASE", "RENT", "SALE"] },
          propertyType: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          district: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          rooms: { anyOf: [{ type: "string", maxLength: 30 }, { type: "null" }] },
          source: { type: "string", enum: ["META", "WEBSITE", "MANUAL"] },
          comment: { anyOf: [{ type: "string", maxLength: 5_000 }, { type: "null" }] },
        },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const existing = await database.client.deal.findFirst({
      where: { id: request.params.dealId, organizationId: user.organization.id },
    });
    if (!existing) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    if (request.body.stageId) {
      const stage = await database.client.pipelineStage.findFirst({
        where: { id: request.body.stageId, pipelineId: existing.pipelineId },
      });
      if (!stage) return reply.status(400).send({ error: "invalid_stage", message: "Этап воронки не найден." });
    }

    if (request.body.assigneeId) {
      const membership = await database.client.membership.findUnique({
        where: { organizationId_userId: { organizationId: user.organization.id, userId: request.body.assigneeId } },
      });
      if (!membership || membership.status !== "ACTIVE") {
        return reply.status(400).send({ error: "invalid_assignee", message: "Ответственный не входит в эту организацию." });
      }
    }

    const updated = await database.client.deal.update({
      where: { id: existing.id },
      data: {
        ...(request.body.stageId !== undefined ? { stageId: request.body.stageId } : {}),
        ...(request.body.assigneeId !== undefined ? { assigneeId: request.body.assigneeId } : {}),
        ...(request.body.title !== undefined ? { title: request.body.title.trim() } : {}),
        ...(request.body.request !== undefined ? { request: optionalText(request.body.request) ?? "" } : {}),
        ...(request.body.budget !== undefined ? { budget: optionalText(request.body.budget ?? undefined) } : {}),
        ...(request.body.operation !== undefined ? { operation: request.body.operation } : {}),
        ...(request.body.propertyType !== undefined ? { propertyType: optionalText(request.body.propertyType ?? undefined) } : {}),
        ...(request.body.district !== undefined ? { district: optionalText(request.body.district ?? undefined) } : {}),
        ...(request.body.rooms !== undefined ? { rooms: optionalText(request.body.rooms ?? undefined) } : {}),
        ...(request.body.source !== undefined ? { source: request.body.source } : {}),
        ...(request.body.comment !== undefined ? { comment: optionalText(request.body.comment ?? undefined) } : {}),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: existing.contactId,
        dealId: existing.id,
        authorId: user.id,
        category: "CHANGE",
        title: "Изменения сохранены",
        description: request.body.stageId && request.body.stageId !== existing.stageId ? "Обновлены параметры и этап сделки" : "Обновлены параметры сделки",
      },
    });

    return { deal: mapDeal(updated), stageId: updated.stageId };
  });

  app.patch<{
    Params: { dealId: string };
    Body: MoveDealRequest;
    Reply: { deal: PipelineDealRecord; stageId: string } | ApiErrorResponse;
  }>("/deals/:dealId/stage", {
    schema: {
      params: { type: "object", required: ["dealId"], properties: { dealId: { type: "string", format: "uuid" } } },
      body: { type: "object", additionalProperties: false, required: ["stageId"], properties: { stageId: { type: "string", format: "uuid" }, position: { type: "integer", minimum: 0 } } },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const deal = await database.client.deal.findFirst({ where: { id: request.params.dealId, organizationId: user.organization.id } });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    const stage = await database.client.pipelineStage.findFirst({ where: { id: request.body.stageId, pipelineId: deal.pipelineId } });
    if (!stage) return reply.status(400).send({ error: "invalid_stage", message: "Этап воронки не найден." });

    const updated = await database.client.deal.update({
      where: { id: deal.id },
      data: { stageId: stage.id, position: request.body.position ?? 0 },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: deal.contactId,
        dealId: deal.id,
        authorId: user.id,
        category: "CHANGE",
        title: "Этап изменён",
        description: `Сделка перенесена в «${stage.title}»`,
      },
    });
    return { deal: mapDeal(updated), stageId: stage.id };
  });
}
