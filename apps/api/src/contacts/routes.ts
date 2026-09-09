import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  ContactListResponse,
  ContactRecord,
  CreateContactRequest,
  LinkContactRequest,
  UpdateContactRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { canAssignTo, dataScope, effectiveAssigneeId, hasOrganizationWideDataAccess } from "../auth/authorization.js";
import { requireUser } from "../auth/require-user.js";
import { parsePhone } from "../lib/phone.js";

function optionalText(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

const sourceLabels = { META: "Meta", WEBSITE: "Сайт", MANUAL: "Не указан" } as const;

function describeChange(label: string, previous: string | null, next: string | null): string | null {
  if ((previous ?? "") === (next ?? "")) return null;
  if (!previous && next) return `${label} добавлен: «${next}»`;
  if (previous && !next) return `${label} очищен`;
  return `${label}: «${previous}» → «${next}»`;
}

function contactInclude(assigneeId?: string) {
  return {
    assignee: { select: { id: true, name: true } },
    deals: { where: { status: "ACTIVE" as const, ...(assigneeId ? { assigneeId } : {}) }, select: { id: true, number: true, title: true, request: true, budget: true, stage: { select: { id: true, title: true, color: true } } } },
    relatedDeals: { where: { deal: { status: "ACTIVE" as const, ...(assigneeId ? { assigneeId } : {}) } }, include: { deal: { select: { id: true, number: true, title: true, request: true, budget: true, stage: { select: { id: true, title: true, color: true } } } } } },
    relationsAsA: { ...(assigneeId ? { where: { contactB: { assigneeId } } } : {}), include: { contactB: { select: { id: true, name: true, phone: true } } } },
    relationsAsB: { ...(assigneeId ? { where: { contactA: { assigneeId } } } : {}), include: { contactA: { select: { id: true, name: true, phone: true } } } },
    tasks: { where: { status: "ACTIVE" as const, ...(assigneeId ? { assigneeId } : {}) }, orderBy: [{ dueDate: "asc" as const }, { dueTime: "asc" as const }], take: 1, select: { id: true, title: true, dueDate: true, dueTime: true } },
  };
}

function mapContact(contact: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  source: "META" | "WEBSITE" | "MANUAL";
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: { id: string; name: string } | null;
  deals?: Array<{ id: string; number: number; title: string; request: string; budget: string | null; stage: { id: string; title: string; color: string } }>;
  relatedDeals?: Array<{ deal: { id: string; number: number; title: string; request: string; budget: string | null; stage: { id: string; title: string; color: string } } }>;
  relationsAsA?: Array<{ label: string | null; contactB: { id: string; name: string; phone: string | null } }>;
  relationsAsB?: Array<{ label: string | null; contactA: { id: string; name: string; phone: string | null } }>;
  tasks?: Array<{ id: string; title: string; dueDate: Date | null; dueTime: string | null }>;
}): ContactRecord {
  const { deals: primaryDeals, relatedDeals, relationsAsA, relationsAsB, tasks, ...record } = contact;
  const deals = Array.from(new Map([
    ...(primaryDeals ?? []),
    ...(relatedDeals?.map((link) => link.deal) ?? []),
  ].map((deal) => [deal.id, deal])).values());
  return {
    ...record,
    dealIds: deals.map((deal) => deal.id),
    deals,
    relatedContacts: [
      ...(relationsAsA?.map((relation) => ({ ...relation.contactB, label: relation.label })) ?? []),
      ...(relationsAsB?.map((relation) => ({ ...relation.contactA, label: relation.label })) ?? []),
    ],
    nextTask: tasks?.[0] ? { ...tasks[0], dueDate: tasks[0].dueDate?.toISOString().slice(0, 10) ?? null } : null,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export async function registerContactRoutes(
  app: FastifyInstance,
  database: DatabaseConnection,
): Promise<void> {
  app.get<{
    Querystring: { q?: string };
    Reply: ContactListResponse | ApiErrorResponse;
  }>("/contacts", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const query = request.query.q?.trim();
    const contacts = await database.client.contact.findMany({
      where: {
        ...dataScope(user),
        ...(query ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { email: { contains: query, mode: "insensitive" } },
            { telegram: { contains: query, mode: "insensitive" } },
          ],
        } : {}),
      },
      include: contactInclude(hasOrganizationWideDataAccess(user) ? undefined : user.id),
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return {
      contacts: contacts.map(mapContact),
      total: contacts.length,
    };
  });

  app.post<{
    Body: CreateContactRequest;
    Reply: { contact: ContactRecord } | ApiErrorResponse;
  }>("/contacts", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["name", "phone"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          phone: { type: "string", minLength: 1, maxLength: 50 },
          email: { type: "string", format: "email", maxLength: 320 },
          telegram: { type: "string", maxLength: 100 },
          source: { type: "string", enum: ["META", "WEBSITE", "MANUAL"] },
          assigneeId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
          comment: { type: "string", maxLength: 5_000 },
        },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    if (!canAssignTo(user, request.body.assigneeId)) {
      return reply.status(403).send({ error: "forbidden", message: "Менеджер может назначать контакты только себе." });
    }

    if (request.body.assigneeId) {
      const membership = await database.client.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: user.organization.id,
            userId: request.body.assigneeId,
          },
        },
      });

      if (!membership || membership.status !== "ACTIVE") {
        return reply.status(400).send({
          error: "invalid_assignee",
          message: "Ответственный не входит в эту организацию.",
        });
      }
    }

    const parsedPhone = parsePhone(request.body.phone);
    if (!parsedPhone) {
      return reply.status(400).send({ error: "invalid_phone", message: "Введите корректный номер телефона." });
    }
    const duplicate = await database.client.contact.findFirst({
      where: { organizationId: user.organization.id, normalizedPhone: parsedPhone.normalized },
    });
    if (duplicate) {
      return reply.status(409).send({
        error: "contact_already_exists",
        message: hasOrganizationWideDataAccess(user)
          ? `Контакт «${duplicate.name}» с таким телефоном уже существует.`
          : "Контакт с таким телефоном уже существует. Обратитесь к руководителю.",
      });
    }
    const contact = await database.client.contact.create({
      data: {
        organizationId: user.organization.id,
        name: request.body.name.trim(),
        phone: parsedPhone.formatted,
        normalizedPhone: parsedPhone.normalized,
        email: optionalText(request.body.email)?.toLowerCase() ?? null,
        telegram: optionalText(request.body.telegram),
        source: request.body.source ?? "MANUAL",
        assigneeId: effectiveAssigneeId(user, request.body.assigneeId),
        comment: optionalText(request.body.comment),
      },
      include: contactInclude(hasOrganizationWideDataAccess(user) ? undefined : user.id),
    });

    return reply.status(201).send({ contact: mapContact(contact) });
  });

  app.patch<{
    Params: { contactId: string };
    Body: UpdateContactRequest;
    Reply: { contact: ContactRecord } | ApiErrorResponse;
  }>("/contacts/:contactId", {
    schema: {
      params: { type: "object", required: ["contactId"], properties: { contactId: { type: "string", format: "uuid" } } },
      body: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          phone: { type: "string", minLength: 1, maxLength: 50 },
          email: { anyOf: [{ type: "string", format: "email", maxLength: 320 }, { type: "null" }] },
          telegram: { anyOf: [{ type: "string", maxLength: 100 }, { type: "null" }] },
          source: { type: "string", enum: ["META", "WEBSITE", "MANUAL"] },
          assigneeId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
          comment: { anyOf: [{ type: "string", maxLength: 5_000 }, { type: "null" }] },
        },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const existing = await database.client.contact.findFirst({
      where: { id: request.params.contactId, ...dataScope(user) },
    });
    if (!existing) return reply.status(404).send({ error: "contact_not_found", message: "Контакт не найден." });

    if (!canAssignTo(user, request.body.assigneeId)) {
      return reply.status(403).send({ error: "forbidden", message: "Менеджер не может передать контакт другому сотруднику или снять ответственность." });
    }

    if (request.body.assigneeId) {
      const membership = await database.client.membership.findUnique({
        where: { organizationId_userId: { organizationId: user.organization.id, userId: request.body.assigneeId } },
      });
      if (!membership || membership.status !== "ACTIVE") {
        return reply.status(400).send({ error: "invalid_assignee", message: "Ответственный не входит в эту организацию." });
      }
    }

    const parsedPhone = request.body.phone === undefined ? undefined : parsePhone(request.body.phone);
    if (request.body.phone !== undefined && !parsedPhone) {
      return reply.status(400).send({ error: "invalid_phone", message: "Введите корректный номер телефона." });
    }
    const nextName = request.body.name?.trim() ?? existing.name;
    const nextPhone = parsedPhone?.formatted ?? existing.phone;
    const nextEmail = request.body.email === undefined ? existing.email : optionalText(request.body.email)?.toLowerCase() ?? null;
    const nextTelegram = request.body.telegram === undefined ? existing.telegram : optionalText(request.body.telegram);
    const nextSource = request.body.source ?? existing.source;
    const nextAssigneeId = request.body.assigneeId === undefined ? existing.assigneeId : effectiveAssigneeId(user, request.body.assigneeId);
    const nextComment = request.body.comment === undefined ? existing.comment : optionalText(request.body.comment);
    const contact = await database.client.contact.update({
      where: { id: existing.id },
      data: {
        ...(request.body.name !== undefined ? { name: request.body.name.trim() } : {}),
        ...(parsedPhone ? { phone: parsedPhone.formatted, normalizedPhone: parsedPhone.normalized } : {}),
        ...(request.body.email !== undefined ? { email: optionalText(request.body.email)?.toLowerCase() ?? null } : {}),
        ...(request.body.telegram !== undefined ? { telegram: optionalText(request.body.telegram) } : {}),
        ...(request.body.source !== undefined ? { source: request.body.source } : {}),
        ...(request.body.assigneeId !== undefined ? { assigneeId: nextAssigneeId } : {}),
        ...(request.body.comment !== undefined ? { comment: optionalText(request.body.comment) } : {}),
      },
      include: contactInclude(hasOrganizationWideDataAccess(user) ? undefined : user.id),
    });

    if (request.body.source !== undefined && request.body.source !== existing.source) {
      await database.client.deal.updateMany({
        where: { organizationId: user.organization.id, contactId: existing.id, ...(hasOrganizationWideDataAccess(user) ? {} : { assigneeId: user.id }) },
        data: { source: request.body.source },
      });
    }

    const changes = [
      describeChange("Имя", existing.name, nextName),
      describeChange("Телефон", existing.phone, nextPhone),
      describeChange("Email", existing.email, nextEmail),
      describeChange("Telegram", existing.telegram, nextTelegram),
      existing.source === nextSource ? null : `Источник: «${sourceLabels[existing.source]}» → «${sourceLabels[nextSource]}»`,
      existing.assigneeId === nextAssigneeId ? null : "Ответственный изменён",
      describeChange("Комментарий", existing.comment, nextComment),
    ].filter((change): change is string => Boolean(change));

    if (changes.length > 0) {
      await database.client.activityEvent.create({
        data: {
          organizationId: user.organization.id,
          contactId: existing.id,
          authorId: user.id,
          category: "CHANGE",
          title: "Контакт обновлён",
          description: changes.join("; "),
        },
      });
    }

    return { contact: mapContact(contact) };
  });

  app.post<{
    Params: { contactId: string };
    Body: LinkContactRequest;
    Reply: { relatedContacts: ContactRecord["relatedContacts"] } | ApiErrorResponse;
  }>("/contacts/:contactId/relations", {
    schema: {
      params: { type: "object", required: ["contactId"], properties: { contactId: { type: "string", format: "uuid" } } },
      body: { type: "object", additionalProperties: false, required: ["relatedContactId"], properties: { relatedContactId: { type: "string", format: "uuid" }, label: { type: "string", maxLength: 80 } } },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (request.params.contactId === request.body.relatedContactId) return reply.status(409).send({ error: "same_contact", message: "Нельзя связать контакт с самим собой." });

    const contacts = await database.client.contact.findMany({
      where: { ...dataScope(user), id: { in: [request.params.contactId, request.body.relatedContactId] } },
      select: { id: true, name: true, phone: true },
    });
    if (contacts.length !== 2) return reply.status(404).send({ error: "contact_not_found", message: "Один из контактов не найден." });

    const contactIds = [request.params.contactId, request.body.relatedContactId].sort();
    const contactAId = contactIds[0]!;
    const contactBId = contactIds[1]!;
    const existing = await database.client.contactRelation.findUnique({ where: { contactAId_contactBId: { contactAId, contactBId } } });
    if (existing) return reply.status(409).send({ error: "contacts_already_related", message: "Контакты уже связаны." });

    const label = optionalText(request.body.label);
    await database.client.contactRelation.create({ data: { organizationId: user.organization.id, contactAId, contactBId, label } });
    const current = contacts.find((contact) => contact.id === request.params.contactId)!;
    const related = contacts.find((contact) => contact.id === request.body.relatedContactId)!;
    await database.client.activityEvent.createMany({ data: [
      { organizationId: user.organization.id, contactId: current.id, authorId: user.id, category: "CHANGE", title: "Добавлен связанный контакт", description: `${related.name}${label ? ` · ${label}` : ""}` },
      { organizationId: user.organization.id, contactId: related.id, authorId: user.id, category: "CHANGE", title: "Добавлен связанный контакт", description: `${current.name}${label ? ` · ${label}` : ""}` },
    ] });

    return { relatedContacts: [{ id: related.id, name: related.name, phone: related.phone, label }] };
  });

  app.delete<{
    Params: { contactId: string; relatedContactId: string };
    Reply: { ok: true } | ApiErrorResponse;
  }>("/contacts/:contactId/relations/:relatedContactId", {
    schema: { params: { type: "object", required: ["contactId", "relatedContactId"], properties: { contactId: { type: "string", format: "uuid" }, relatedContactId: { type: "string", format: "uuid" } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const contactIds = [request.params.contactId, request.params.relatedContactId].sort();
    const contactAId = contactIds[0]!;
    const contactBId = contactIds[1]!;
    const relation = await database.client.contactRelation.findFirst({
      where: {
        contactAId,
        contactBId,
        organizationId: user.organization.id,
        ...(hasOrganizationWideDataAccess(user) ? {} : { contactA: { assigneeId: user.id }, contactB: { assigneeId: user.id } }),
      },
      include: { contactA: { select: { name: true } }, contactB: { select: { name: true } } },
    });
    if (!relation) return reply.status(404).send({ error: "relation_not_found", message: "Связь контактов не найдена." });
    await database.client.contactRelation.delete({ where: { id: relation.id } });
    await database.client.activityEvent.createMany({ data: [
      { organizationId: user.organization.id, contactId: request.params.contactId, authorId: user.id, category: "CHANGE", title: "Связь контактов удалена", description: request.params.contactId === contactAId ? relation.contactB.name : relation.contactA.name },
      { organizationId: user.organization.id, contactId: request.params.relatedContactId, authorId: user.id, category: "CHANGE", title: "Связь контактов удалена", description: request.params.relatedContactId === contactAId ? relation.contactB.name : relation.contactA.name },
    ] });
    return { ok: true };
  });
}
