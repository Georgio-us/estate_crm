import type { FastifyInstance } from "fastify";

import type {
  ActivityEventRecord,
  ActivityListResponse,
  ApiErrorResponse,
  CreateNoteRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { contactScope, dataScope, dealScope, hasOrganizationWideDataAccess } from "../auth/authorization.js";
import { requireUser } from "../auth/require-user.js";

function mapActivity(activity: {
  id: string;
  contactId: string | null;
  dealId: string | null;
  category: "NOTE" | "TASK" | "CHANGE" | "SOURCE" | "OBJECT";
  title: string;
  description: string | null;
  createdAt: Date;
  author: { id: string; name: string } | null;
}): ActivityEventRecord {
  return {
    id: activity.id,
    contactId: activity.contactId,
    dealId: activity.dealId,
    category: activity.category,
    title: activity.title,
    description: activity.description,
    author: activity.author,
    occurredAt: activity.createdAt.toISOString(),
  };
}

const noteBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: { text: { type: "string", minLength: 1, maxLength: 5_000 } },
} as const;

const idParamsSchema = (field: "dealId" | "contactId") => ({
  type: "object",
  required: [field],
  properties: { [field]: { type: "string", format: "uuid" } },
});

export async function registerActivityRoutes(
  app: FastifyInstance,
  database: DatabaseConnection,
): Promise<void> {
  app.get<{
    Params: { dealId: string };
    Reply: ActivityListResponse | ApiErrorResponse;
  }>("/deals/:dealId/activities", {
    schema: { params: idParamsSchema("dealId") },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const deal = await database.client.deal.findFirst({
      where: { id: request.params.dealId, ...dealScope(user) },
      select: { id: true },
    });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    const activities = await database.client.activityEvent.findMany({
      where: { organizationId: user.organization.id, dealId: deal.id },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { activities: activities.map(mapActivity) };
  });

  app.post<{
    Params: { dealId: string };
    Body: CreateNoteRequest;
    Reply: { activity: ActivityEventRecord } | ApiErrorResponse;
  }>("/deals/:dealId/notes", {
    schema: { params: idParamsSchema("dealId"), body: noteBodySchema },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const deal = await database.client.deal.findFirst({
      where: { id: request.params.dealId, ...dealScope(user) },
      select: { id: true, contactId: true },
    });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });

    const activity = await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: deal.contactId,
        dealId: deal.id,
        authorId: user.id,
        category: "NOTE",
        title: "Добавлено примечание",
        description: request.body.text.trim(),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return reply.status(201).send({ activity: mapActivity(activity) });
  });

  app.get<{
    Params: { contactId: string };
    Reply: ActivityListResponse | ApiErrorResponse;
  }>("/contacts/:contactId/activities", {
    schema: { params: idParamsSchema("contactId") },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const contact = await database.client.contact.findFirst({
      where: { id: request.params.contactId, ...contactScope(user) },
      select: { id: true },
    });
    if (!contact) return reply.status(404).send({ error: "contact_not_found", message: "Контакт не найден." });

    const activities = await database.client.activityEvent.findMany({
      where: {
        organizationId: user.organization.id,
        AND: [
          {
            OR: [
              { contactId: contact.id },
              { deal: { relatedContacts: { some: { contactId: contact.id } } } },
            ],
          },
          ...(hasOrganizationWideDataAccess(user) ? [] : [{
            OR: [
              { dealId: null, contactId: contact.id },
              { deal: { assigneeId: user.id } },
            ],
          }]),
        ],
      },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { activities: activities.map(mapActivity) };
  });

  app.post<{
    Params: { contactId: string };
    Body: CreateNoteRequest;
    Reply: { activity: ActivityEventRecord } | ApiErrorResponse;
  }>("/contacts/:contactId/notes", {
    schema: { params: idParamsSchema("contactId"), body: noteBodySchema },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const contact = await database.client.contact.findFirst({
      where: { id: request.params.contactId, ...contactScope(user) },
      select: { id: true },
    });
    if (!contact) return reply.status(404).send({ error: "contact_not_found", message: "Контакт не найден." });

    const activity = await database.client.activityEvent.create({
      data: {
        organizationId: user.organization.id,
        contactId: contact.id,
        authorId: user.id,
        category: "NOTE",
        title: "Добавлено примечание",
        description: request.body.text.trim(),
      },
      include: { author: { select: { id: true, name: true } } },
    });
    return reply.status(201).send({ activity: mapActivity(activity) });
  });
}
