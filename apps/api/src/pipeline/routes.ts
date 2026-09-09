import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CreateDealRequest,
  LinkDealContactRequest,
  MoveDealRequest,
  PipelineConfigurationResponse,
  PipelineDealRecord,
  PipelineResponse,
  UpdatePipelineConfigurationRequest,
  UpdateDealLifecycleRequest,
  UpdateDealRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { canAssignTo, canConfigureOrganization, contactScope, dealScope, effectiveAssigneeId, hasOrganizationWideDataAccess } from "../auth/authorization.js";
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
            ? dealScope(user)
            : request.query.view === "closed"
              ? { status: { not: "ACTIVE" }, ...dealScope(user) }
              : { status: "ACTIVE", ...dealScope(user) },
          orderBy: [{ position: "asc" }, { createdAt: "desc" }],
          include: {
            contact: { select: { id: true, name: true, phone: true } },
            relatedContacts: { include: { contact: { select: { id: true, name: true, phone: true } } } },
            assignee: { select: { id: true, name: true } },
            tasks: { where: { status: "ACTIVE", ...(hasOrganizationWideDataAccess(user) ? {} : { assigneeId: user.id }) }, orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
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

  app.get<{
    Reply: PipelineConfigurationResponse | ApiErrorResponse;
  }>("/pipeline/configuration", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!canConfigureOrganization(user)) {
      return reply.status(403).send({ error: "forbidden", message: "Настройки воронки доступны только администратору." });
    }

    const pipeline = await ensureDefaultPipeline(database, user.organization.id);
    const stages = await database.client.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { position: "asc" },
      include: { _count: { select: { deals: true } } },
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
          dealCount: stage._count.deals,
        })),
      },
    };
  });

  app.put<{
    Body: UpdatePipelineConfigurationRequest;
    Reply: PipelineConfigurationResponse | ApiErrorResponse;
  }>("/pipeline/configuration", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["stages"],
        properties: {
          stages: {
            type: "array",
            minItems: 1,
            maxItems: 30,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "color"],
              properties: {
                id: { type: "string", format: "uuid" },
                title: { type: "string", minLength: 1, maxLength: 100 },
                color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!canConfigureOrganization(user)) {
      return reply.status(403).send({ error: "forbidden", message: "Настройки воронки доступны только администратору." });
    }

    const pipeline = await ensureDefaultPipeline(database, user.organization.id);
    const existingStages = await database.client.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      include: { _count: { select: { deals: true } } },
    });
    const existingById = new Map(existingStages.map((stage) => [stage.id, stage]));
    const submittedIds = request.body.stages.flatMap((stage) => stage.id ? [stage.id] : []);

    if (new Set(submittedIds).size !== submittedIds.length || submittedIds.some((id) => !existingById.has(id))) {
      return reply.status(400).send({ error: "invalid_stage", message: "Один из этапов не принадлежит этой воронке." });
    }

    const normalizedStages = request.body.stages.map((stage) => ({ ...stage, title: stage.title.trim() }));
    if (normalizedStages.some((stage) => !stage.title)) {
      return reply.status(400).send({ error: "invalid_stage_title", message: "Название этапа не может быть пустым." });
    }

    const submittedIdSet = new Set(submittedIds);
    const populatedRemovedStage = existingStages.find((stage) => !submittedIdSet.has(stage.id) && stage._count.deals > 0);
    if (populatedRemovedStage) {
      return reply.status(409).send({
        error: "stage_not_empty",
        message: `Сначала перенесите сделки из этапа «${populatedRemovedStage.title}», затем его можно удалить.`,
      });
    }

    await database.client.$transaction(async (transaction) => {
      await transaction.pipelineStage.updateMany({
        where: { pipelineId: pipeline.id },
        data: { position: { increment: 10_000 } },
      });
      await transaction.pipelineStage.deleteMany({
        where: { pipelineId: pipeline.id, id: { notIn: submittedIds } },
      });

      const stageIds: string[] = [];
      for (const [index, stage] of normalizedStages.entries()) {
        if (stage.id) {
          await transaction.pipelineStage.update({
            where: { id: stage.id },
            data: { title: stage.title, color: stage.color, position: 20_000 + index },
          });
          stageIds.push(stage.id);
        } else {
          const created = await transaction.pipelineStage.create({
            data: { pipelineId: pipeline.id, title: stage.title, color: stage.color, position: 20_000 + index },
          });
          stageIds.push(created.id);
        }
      }

      for (const [position, id] of stageIds.entries()) {
        await transaction.pipelineStage.update({ where: { id }, data: { position } });
      }
    });

    const stages = await database.client.pipelineStage.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { position: "asc" },
      include: { _count: { select: { deals: true } } },
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
          dealCount: stage._count.deals,
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

    if (!canAssignTo(user, request.body.assigneeId)) {
      return reply.status(403).send({ error: "forbidden", message: "Менеджер может назначать сделки только себе." });
    }

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
      where: { id: request.body.contactId, ...contactScope(user) },
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
          message: hasOrganizationWideDataAccess(user)
            ? `Контакт «${contact.name}» с таким телефоном уже существует. Выберите его в поле «Контакт из базы».`
            : "Контакт с таким телефоном уже существует. Обратитесь к руководителю.",
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
            assigneeId: effectiveAssigneeId(user, request.body.assigneeId),
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
        assigneeId: effectiveAssigneeId(user, request.body.assigneeId),
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
      where: { id: request.params.dealId, ...dealScope(user) },
      include: { stage: { select: { id: true, title: true } } },
    });
    if (!existing) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    if (!canAssignTo(user, request.body.assigneeId)) {
      return reply.status(403).send({ error: "forbidden", message: "Менеджер не может передать сделку другому сотруднику или снять ответственность." });
    }

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

    const nextAssigneeId = request.body.assigneeId === undefined
      ? existing.assigneeId
      : !hasOrganizationWideDataAccess(user) && existing.assigneeId === null && request.body.assigneeId === null
        ? null
        : effectiveAssigneeId(user, request.body.assigneeId);

    const updated = await database.client.deal.update({
      where: { id: existing.id },
      data: {
        ...(request.body.stageId !== undefined ? { stageId: request.body.stageId } : {}),
        ...(request.body.assigneeId !== undefined ? { assigneeId: nextAssigneeId } : {}),
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

    if (request.body.source !== undefined && request.body.source !== existing.source && hasOrganizationWideDataAccess(user)) {
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

    if (updated.assignee && updated.assignee.id !== existing.assigneeId) {
      await database.client.notificationOutbox.create({
        data: {
          organizationId: user.organization.id,
          channel: "TELEGRAM",
          eventType: "deal.assigned",
          title: "Вам назначена сделка",
          body: updated.title || updated.request || updated.contact.name,
          actionUrl: `/?deal=${updated.id}`,
          dedupeKey: `deal:${updated.id}:${updated.updatedAt.toISOString()}:deal.assigned`,
          payload: {
            dealId: updated.id,
            dealNumber: updated.number,
            assigneeId: updated.assignee.id,
          },
        },
      });
    }

    return { deal: mapDeal(updated), stageId: updated.stageId };
  });

  app.post<{
    Body: { dealIds: string[] };
    Reply: { deleted: number } | ApiErrorResponse;
  }>("/deals/bulk-delete", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["dealIds"],
        properties: { dealIds: { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", format: "uuid" } } },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!hasOrganizationWideDataAccess(user)) {
      return reply.status(403).send({ error: "forbidden", message: "Удалять закрытые сделки может только администратор или руководитель." });
    }

    const deals = await database.client.deal.findMany({
      where: { id: { in: request.body.dealIds }, organizationId: user.organization.id },
      select: { id: true, number: true, title: true, contactId: true, status: true },
    });
    if (deals.length !== request.body.dealIds.length) {
      return reply.status(404).send({ error: "deal_not_found", message: "Одна или несколько сделок не найдены." });
    }
    if (deals.some((deal) => deal.status === "ACTIVE")) {
      return reply.status(409).send({ error: "active_deal", message: "Активные сделки нельзя удалить. Сначала закройте их." });
    }

    await database.client.$transaction(async (transaction) => {
      await transaction.activityEvent.createMany({
        data: deals.map((deal) => ({ organizationId: user.organization.id, contactId: deal.contactId, authorId: user.id, category: "CHANGE" as const, title: "Закрытая сделка удалена", description: `Сделка #${deal.number} · ${deal.title}` })),
      });
      await transaction.deal.deleteMany({ where: { id: { in: request.body.dealIds }, organizationId: user.organization.id, status: { not: "ACTIVE" } } });
    });
    return { deleted: deals.length };
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
      where: { id: request.params.dealId, ...dealScope(user) },
      select: { id: true, stageId: true, contactId: true },
    });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });
    if (deal.contactId === request.body.contactId) {
      return reply.status(409).send({ error: "contact_is_primary", message: "Этот контакт уже является основным в сделке." });
    }

    const contact = await database.client.contact.findFirst({
      where: { id: request.body.contactId, ...contactScope(user) },
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
      where: { id: request.params.dealId, ...dealScope(user) },
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
      where: { id: request.params.dealId, ...dealScope(user) },
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

    const deal = await database.client.deal.findFirst({ where: { id: request.params.dealId, ...dealScope(user) } });
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
