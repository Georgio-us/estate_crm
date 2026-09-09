import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CompleteTaskRequest,
  CreateTaskRequest,
  TaskListResponse,
  TaskRecord,
  UpdateTaskRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";

const taskInclude = {
  contact: { select: { id: true, name: true } },
  deal: { select: { id: true, number: true, title: true } },
  assignee: { select: { id: true, name: true } },
} as const;

function optionalText(value: string | null | undefined) {
  return value?.trim() || null;
}

function parseDueDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function cancelPendingTaskNotifications(database: DatabaseConnection, organizationId: string, taskId: string) {
  await database.client.notificationOutbox.updateMany({
    where: {
      organizationId,
      channel: "TELEGRAM",
      status: "PENDING",
      dedupeKey: { startsWith: `task:${taskId}:` },
    },
    data: { status: "CANCELLED" },
  });
}

function mapTask(task: {
  id: string;
  title: string;
  kind: "CALL" | "MEETING" | "MESSAGE" | "OTHER";
  status: "ACTIVE" | "COMPLETED";
  dueDate: Date | null;
  dueTime: string | null;
  result: string | null;
  completedAt: Date | null;
  contact: { id: string; name: string } | null;
  deal: { id: string; number: number; title: string } | null;
  assignee: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskRecord {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

const idParamsSchema = {
  type: "object",
  required: ["taskId"],
  properties: { taskId: { type: "string", format: "uuid" } },
} as const;

const taskProperties = {
  title: { type: "string", minLength: 1, maxLength: 500 },
  kind: { type: "string", enum: ["CALL", "MEETING", "MESSAGE", "OTHER"] },
  dueDate: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
  dueTime: { anyOf: [{ type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$" }, { type: "null" }] },
  contactId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
  dealId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
  assigneeId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
} as const;

async function resolveRelations(database: DatabaseConnection, organizationId: string, body: CreateTaskRequest) {
  let contactId = body.contactId ?? null;
  if (body.dealId) {
    const deal = await database.client.deal.findFirst({
      where: { id: body.dealId, organizationId },
      select: { id: true, contactId: true, relatedContacts: { select: { contactId: true } } },
    });
    if (!deal) return { error: "deal_not_found" as const };
    if (contactId && contactId !== deal.contactId && !deal.relatedContacts.some((item) => item.contactId === contactId)) return { error: "contact_not_in_deal" as const };
    contactId ??= deal.contactId;
  } else if (contactId) {
    const contact = await database.client.contact.findFirst({ where: { id: contactId, organizationId }, select: { id: true } });
    if (!contact) return { error: "contact_not_found" as const };
  }
  if (body.assigneeId) {
    const membership = await database.client.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: body.assigneeId } } });
    if (!membership) return { error: "assignee_not_found" as const };
  }
  return { contactId };
}

export async function registerTaskRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: TaskListResponse | ApiErrorResponse }>("/tasks", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const tasks = await database.client.task.findMany({
      where: { organizationId: user.organization.id },
      include: taskInclude,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    return { tasks: tasks.map(mapTask), total: tasks.length };
  });

  app.post<{ Body: CreateTaskRequest; Reply: { task: TaskRecord } | ApiErrorResponse }>("/tasks", {
    schema: { body: { type: "object", additionalProperties: false, required: ["title"], properties: taskProperties } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const relations = await resolveRelations(database, user.organization.id, request.body);
    if ("error" in relations) return reply.status(404).send({ error: relations.error ?? "relation_not_found", message: "Не удалось найти связанную сущность задачи." });
    const task = await database.client.task.create({
      data: {
        organizationId: user.organization.id,
        title: request.body.title.trim(),
        kind: request.body.kind ?? "CALL",
        dueDate: parseDueDate(request.body.dueDate),
        dueTime: optionalText(request.body.dueTime),
        contactId: relations.contactId,
        dealId: request.body.dealId ?? null,
        assigneeId: request.body.assigneeId ?? user.id,
      },
      include: taskInclude,
    });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: task.contact?.id, dealId: task.deal?.id, authorId: user.id, category: "TASK", title: "Поставлена задача", description: task.title } });
    return reply.status(201).send({ task: mapTask(task) });
  });

  app.patch<{ Params: { taskId: string }; Body: UpdateTaskRequest; Reply: { task: TaskRecord } | ApiErrorResponse }>("/tasks/:taskId", {
    schema: { params: idParamsSchema, body: { type: "object", additionalProperties: false, properties: { ...taskProperties, status: { type: "string", enum: ["ACTIVE", "COMPLETED"] }, result: { anyOf: [{ type: "string", maxLength: 5_000 }, { type: "null" }] } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.task.findFirst({ where: { id: request.params.taskId, organizationId: user.organization.id } });
    if (!existing) return reply.status(404).send({ error: "task_not_found", message: "Задача не найдена." });
    const relations = await resolveRelations(database, user.organization.id, { ...request.body, contactId: request.body.contactId === undefined ? existing.contactId : request.body.contactId, dealId: request.body.dealId === undefined ? existing.dealId : request.body.dealId, assigneeId: request.body.assigneeId === undefined ? existing.assigneeId : request.body.assigneeId } as CreateTaskRequest);
    if ("error" in relations) return reply.status(404).send({ error: relations.error ?? "relation_not_found", message: "Не удалось найти связанную сущность задачи." });
    const nextStatus = request.body.status ?? existing.status;
    const task = await database.client.task.update({
      where: { id: existing.id },
      data: {
        ...(request.body.title !== undefined ? { title: request.body.title.trim() } : {}),
        ...(request.body.kind !== undefined ? { kind: request.body.kind } : {}),
        ...(request.body.dueDate !== undefined ? { dueDate: parseDueDate(request.body.dueDate) } : {}),
        ...(request.body.dueTime !== undefined ? { dueTime: optionalText(request.body.dueTime) } : {}),
        ...(request.body.contactId !== undefined || request.body.dealId !== undefined ? { contactId: relations.contactId } : {}),
        ...(request.body.dealId !== undefined ? { dealId: request.body.dealId } : {}),
        ...(request.body.assigneeId !== undefined ? { assigneeId: request.body.assigneeId } : {}),
        ...(request.body.status !== undefined ? { status: nextStatus, completedAt: nextStatus === "COMPLETED" ? existing.completedAt ?? new Date() : null } : {}),
        ...(request.body.result !== undefined ? { result: optionalText(request.body.result) } : {}),
      },
      include: taskInclude,
    });
    await cancelPendingTaskNotifications(database, user.organization.id, existing.id);
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: task.contact?.id, dealId: task.deal?.id, authorId: user.id, category: "TASK", title: nextStatus === "COMPLETED" && existing.status !== "COMPLETED" ? "Задача выполнена" : "Задача обновлена", description: task.result || task.title } });
    return { task: mapTask(task) };
  });

  app.post<{ Params: { taskId: string }; Body: CompleteTaskRequest; Reply: { task: TaskRecord } | ApiErrorResponse }>("/tasks/:taskId/complete", {
    schema: { params: idParamsSchema, body: { type: "object", additionalProperties: false, properties: { result: { type: "string", maxLength: 5_000 } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const existing = await database.client.task.findFirst({ where: { id: request.params.taskId, organizationId: user.organization.id }, include: taskInclude });
    if (!existing) return reply.status(404).send({ error: "task_not_found", message: "Задача не найдена." });
    const task = await database.client.task.update({ where: { id: existing.id }, data: { status: "COMPLETED", result: optionalText(request.body.result) || "Выполнено", completedAt: existing.completedAt ?? new Date() }, include: taskInclude });
    await cancelPendingTaskNotifications(database, user.organization.id, existing.id);
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, contactId: task.contact?.id, dealId: task.deal?.id, authorId: user.id, category: "TASK", title: "Задача выполнена", description: task.result } });
    return { task: mapTask(task) };
  });
}
