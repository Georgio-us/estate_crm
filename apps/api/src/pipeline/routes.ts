import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CreateDealRequest,
  LinkDealContactRequest,
  MoveDealRequest,
  PipelineDealRecord,
  PipelineResponse,
  UpdateDealLifecycleRequest,
  UpdateDealRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import { parsePhone } from "../lib/phone.js";

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

const sourceLabels = { META: "Meta", WEBSITE: "Сайт", MANUAL: "Не указан" } as const;
const operationLabels = { PURCHASE: "Покупка", RENT: "Аренда", SALE: "Продажа" } as const;
const lifecycleLabels = { ACTIVE: "Сделка возвращена в работу", WON: "Сделка успешно завершена", LOST: "Сделка закрыта как неуспешная", ARCHIVED: "Сделка перенесена в архив" } as const;

function describeChange(label: string, previous: string | null, next: string | null): string | null {
  if ((previous ?? "") === (next ?? "")) return null;
  if (!previous && next) return `${label} добавлен: «${next}»`;
  if (previous && !next) return `${label} очищен`;
  return `${label}: «${previous}» → «${next}»`;
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
  status: "ACTIVE" | "WON" | "LOST" | "ARCHIVED";
  position: number;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contact: { id: string; name: string; phone: string | null };
  relatedContacts?: Array<{ contact: { id: string; name: string; phone: string | null } }>;
  tasks?: Array<{ id: string; title: string; dueDate: Date | null; dueTime: string | null }>;
  assignee: { id: string; name: string } | null;
  title: string;
  comment: string | null;
}): PipelineDealRecord {
  return {
    ...deal,
    relatedContacts: deal.relatedContacts?.map((link) => link.contact) ?? [],
    nextTask: deal.tasks?.[0] ? { ...deal.tasks[0], dueDate: deal.tasks[0].dueDate?.toISOString().slice(0, 10) ?? null } : null,
    closedAt: deal.closedAt?.toISOString() ?? null,
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
  app.get<{
    Querystring: { view?: "active" | "closed" | "all" };
    Reply: PipelineResponse | ApiErrorResponse;
  }>("/pipeline", {
    schema: {
      querystring: {
        type: "object",
        additionalProperties: false,
        properties: { view: { type: "string", enum: ["active", "closed", "all"] } },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const pipeline = await ensureDefaultPipeline(database, user.organization.id);
    const stages = await database.client.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { position: "asc" },
      include: {
        deals: {
          where: request.query.view === "all"
            ? undefined
            : request.query.view === "closed"
              ? { status: { not: "ACTIVE" } }
              : { status: "ACTIVE" },
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          include: {
            contact: { select: { id: true, name: true, phone: true } },
            relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
            assignee: { select: { id: true, name: true } },
            tasks: { where: { status: "ACTIVE" }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
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
        anyOf: [{ required: ["contactId"] }, { required: ["contactName", "phone"] }],
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
      const parsedPhone = parsePhone(request.body.phone);
      if (!parsedPhone) {
        return reply.status(400).send({ error: "invalid_phone", message: "Введите корректный номер телефона." });
      }
      contact = await database.client.contact.findFirst({
        where: { organizationId: user.organization.id, normalizedPhone: parsedPhone.normalized },
      });
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
            phone: parsedPhone.formatted,
            normalizedPhone: parsedPhone.normalized,
            source: request.body.source ?? "MANUAL",
            assigneeId: request.body.assigneeId ?? null,
          },
        });
      }
    }

    const dealSource = request.body.contactId ? contact.source : request.body.source ?? "MANUAL";
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
        source: dealSource,
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
        assignee: { select: { id: true, name: true } },
        tasks: { where: { status: "ACTIVE" }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
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
        description: `Источник: ${sourceLabels[dealSource]}`,
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
      include: { stage: { select: { id: true, title: true } } },
    });
    if (!existing) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    let nextStage: { id: string; title: string } | null = null;
    if (request.body.stageId) {
      nextStage = await database.client.pipelineStage.findFirst({
        where: { id: request.body.stageId, pipelineId: existing.pipelineId },
      });
      if (!nextStage) return reply.status(400).send({ error: "invalid_stage", message: "Этап воронки не найден." });
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
        relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
        assignee: { select: { id: true, name: true } },
        tasks: { where: { status: "ACTIVE" }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
      },
    });

    if (request.body.source !== undefined && request.body.source !== existing.source) {
      await database.client.contact.update({ where: { id: existing.contactId }, data: { source: request.body.source } });
      await database.client.deal.updateMany({
        where: { organizationId: user.organization.id, contactId: existing.contactId, id: { not: existing.id } },
        data: { source: request.body.source },
      });
    }

    const nextRequest = request.body.request === undefined ? existing.request : optionalText(request.body.request) ?? "";
    const nextBudget = request.body.budget === undefined ? existing.budget : optionalText(request.body.budget ?? undefined);
    const nextPropertyType = request.body.propertyType === undefined ? existing.propertyType : optionalText(request.body.propertyType ?? undefined);
    const nextDistrict = request.body.district === undefined ? existing.district : optionalText(request.body.district ?? undefined);
    const nextRooms = request.body.rooms === undefined ? existing.rooms : optionalText(request.body.rooms ?? undefined);
    const nextComment = request.body.comment === undefined ? existing.comment : optionalText(request.body.comment ?? undefined);
    const changes = [
      describeChange("Название", existing.title, request.body.title?.trim() ?? existing.title),
      describeChange("Запрос клиента", existing.request, nextRequest),
      describeChange("Бюджет", existing.budget, nextBudget),
      existing.operation === (request.body.operation ?? existing.operation) ? null : `Операция: «${operationLabels[existing.operation]}» → «${operationLabels[request.body.operation!]}»`,
      describeChange("Тип объекта", existing.propertyType, nextPropertyType),
      describeChange("Район", existing.district, nextDistrict),
      describeChange("Комнаты", existing.rooms, nextRooms),
      existing.source === (request.body.source ?? existing.source) ? null : `Источник: «${sourceLabels[existing.source]}» → «${sourceLabels[request.body.source!]}»`,
      existing.assigneeId === (request.body.assigneeId === undefined ? existing.assigneeId : request.body.assigneeId) ? null : "Ответственный изменён",
      describeChange("Комментарий", existing.comment, nextComment),
      nextStage && nextStage.id !== existing.stageId ? `Этап: «${existing.stage.title}» → «${nextStage.title}»` : null,
    ].filter((change): change is string => Boolean(change));

    if (changes.length > 0) await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: existing.contactId,
        dealId: existing.id,
        authorId: user.id,
        category: "CHANGE",
        title: "Сделка обновлена",
        description: changes.join("; "),
      },
    });

    return { deal: mapDeal(updated), stageId: updated.stageId };
  });

  app.post<{
    Params: { dealId: string };
    Body: LinkDealContactRequest;
    Reply: { deal: PipelineDealRecord; stageId: string } | ApiErrorResponse;
  }>("/deals/:dealId/contacts", {
    schema: {
      params: { type: "object", required: ["dealId"], properties: { dealId: { type: "string", format: "uuid" } } },
      body: { type: "object", additionalProperties: false, required: ["contactId"], properties: { contactId: { type: "string", format: "uuid" } } },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const deal = await database.client.deal.findFirst({
      where: { id: request.params.dealId, organizationId: user.organization.id },
      select: { id: true, stageId: true, contactId: true },
    });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });
    if (deal.contactId === request.body.contactId) {
      return reply.status(409).send({ error: "contact_is_primary", message: "Этот контакт уже является основным в сделке." });
    }

    const contact = await database.client.contact.findFirst({
      where: { id: request.body.contactId, organizationId: user.organization.id },
      select: { id: true, name: true },
    });
    if (!contact) return reply.status(400).send({ error: "invalid_contact", message: "Контакт не найден." });

    const existingLink = await database.client.dealRelatedContact.findUnique({
      where: { dealId_contactId: { dealId: deal.id, contactId: contact.id } },
    });
    if (existingLink) return reply.status(409).send({ error: "contact_already_linked", message: "Контакт уже связан с этой сделкой." });

    await database.client.dealRelatedContact.create({ data: { dealId: deal.id, contactId: contact.id } });
    await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: contact.id,
        dealId: deal.id,
        authorId: user.id,
        category: "CHANGE",
        title: "Добавлен связанный контакт",
        description: contact.name,
      },
    });

    const updated = await database.client.deal.findUniqueOrThrow({
      where: { id: deal.id },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
        relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
        tasks: { where: { status: "ACTIVE" }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
      },
    });
    return { deal: mapDeal(updated), stageId: updated.stageId };
  });

  app.delete<{
    Params: { dealId: string; contactId: string };
    Reply: { deal: PipelineDealRecord; stageId: string } | ApiErrorResponse;
  }>("/deals/:dealId/contacts/:contactId", {
    schema: { params: { type: "object", required: ["dealId", "contactId"], properties: { dealId: { type: "string", format: "uuid" }, contactId: { type: "string", format: "uuid" } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const deal = await database.client.deal.findFirst({
      where: { id: request.params.dealId, organizationId: user.organization.id },
      select: { id: true },
    });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    const link = await database.client.dealRelatedContact.findUnique({
      where: { dealId_contactId: { dealId: deal.id, contactId: request.params.contactId } },
      include: { contact: { select: { name: true } } },
    });
    if (!link) return reply.status(404).send({ error: "linked_contact_not_found", message: "Связанный контакт не найден." });

    await database.client.dealRelatedContact.delete({ where: { dealId_contactId: { dealId: deal.id, contactId: request.params.contactId } } });
    await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: request.params.contactId,
        dealId: deal.id,
        authorId: user.id,
        category: "CHANGE",
        title: "Связанный контакт удалён",
        description: link.contact.name,
      },
    });

    const updated = await database.client.deal.findUniqueOrThrow({
      where: { id: deal.id },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
        relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
        tasks: { where: { status: "ACTIVE" }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
      },
    });
    return { deal: mapDeal(updated), stageId: updated.stageId };
  });

  app.patch<{
    Params: { dealId: string };
    Body: UpdateDealLifecycleRequest;
    Reply: { deal: PipelineDealRecord; stageId: string } | ApiErrorResponse;
  }>("/deals/:dealId/lifecycle", {
    schema: {
      params: { type: "object", required: ["dealId"], properties: { dealId: { type: "string", format: "uuid" } } },
      body: { type: "object", additionalProperties: false, required: ["status"], properties: { status: { type: "string", enum: ["ACTIVE", "WON", "LOST", "ARCHIVED"] } } },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const deal = await database.client.deal.findFirst({
      where: { id: request.params.dealId, organizationId: user.organization.id },
      select: { id: true, contactId: true, stageId: true, status: true, closedAt: true },
    });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    const updated = await database.client.deal.update({
      where: { id: deal.id },
      data: {
        status: request.body.status,
        closedAt: request.body.status === "ACTIVE" ? null : deal.closedAt ?? new Date(),
      },
      include: {
        contact: { select: { id: true, name: true, phone: true } },
        relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
        assignee: { select: { id: true, name: true } },
        tasks: { where: { status: "ACTIVE" }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
      },
    });

    if (deal.status !== request.body.status) {
      await database.client.activityEvent.create({
        data: {
          organizationId: user.organization.id,
          contactId: deal.contactId,
          dealId: deal.id,
          authorId: user.id,
          category: "CHANGE",
          title: lifecycleLabels[request.body.status],
        },
      });
    }

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
        relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
        assignee: { select: { id: true, name: true } },
        tasks: { where: { status: "ACTIVE" }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
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
