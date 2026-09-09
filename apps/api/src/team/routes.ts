import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CreateTeamInvitationRequest,
  TeamInvitationLinkResponse,
  TeamResponse,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "../config.js";
import { requireUser } from "../auth/require-user.js";
import { createInvitationToken, hashInvitationToken, invitationExpiry } from "./invitations.js";

function localDateAndTime(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
}

const invitationIdParams = {
  type: "object",
  required: ["invitationId"],
  properties: { invitationId: { type: "string", format: "uuid" } },
} as const;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invitationUrl(config: ApiConfig, token: string) {
  return `${config.webAppUrl || "http://localhost:3000"}/invite/${token}`;
}

export async function registerTeamRoutes(app: FastifyInstance, config: ApiConfig, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: TeamResponse | ApiErrorResponse }>("/team", async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;

    if (currentUser.organization.role === "MANAGER") {
      return reply.status(403).send({
        error: "forbidden",
        message: "Раздел команды доступен администратору и руководителю.",
      });
    }

    const organizationId = currentUser.organization.id;
    const organization = await database.client.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    const { date: today, time: currentTime } = localDateAndTime(new Date(), organization?.timezone ?? "Europe/Madrid");
    const [memberships, pendingInvitations] = await Promise.all([database.client.membership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            assignedDeals: {
              where: { organizationId, status: "ACTIVE" },
              orderBy: { updatedAt: "desc" },
              select: { id: true, number: true, title: true, request: true },
            },
            assignedTasks: {
              where: { organizationId, status: "ACTIVE" },
              orderBy: [{ dueDate: "asc" }, { dueTime: "asc" }, { createdAt: "desc" }],
              select: {
                id: true,
                title: true,
                dueDate: true,
                dueTime: true,
                contact: { select: { name: true } },
                deal: { select: { id: true, number: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: [{ status: "asc" }, { role: "asc" }, { createdAt: "asc" }],
    }), database.client.teamInvitation.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true },
    })]);
    const pendingInvitationByUser = new Map<string, string>();
    for (const invitation of pendingInvitations) {
      if (!pendingInvitationByUser.has(invitation.userId)) pendingInvitationByUser.set(invitation.userId, invitation.id);
    }

    const members = memberships.map((membership) => {
      const tasks = membership.user.assignedTasks;
      const dateOf = (task: (typeof tasks)[number]) => task.dueDate?.toISOString().slice(0, 10) ?? null;
      const isOverdue = (task: (typeof tasks)[number]) => {
        const dueDate = dateOf(task);
        return Boolean(dueDate && (dueDate < today || (dueDate === today && task.dueTime && task.dueTime < currentTime)));
      };

      return {
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        phone: membership.user.phone,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
        pendingInvitationId: pendingInvitationByUser.get(membership.user.id) ?? null,
        activeDeals: membership.user.assignedDeals.length,
        activeTasks: tasks.length,
        todayTasks: tasks.filter((task) => dateOf(task) === today).length,
        overdueTasks: tasks.filter(isOverdue).length,
        deals: membership.user.assignedDeals,
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          dueDate: dateOf(task),
          dueTime: task.dueTime,
          contactName: task.contact?.name ?? null,
          dealId: task.deal?.id ?? null,
          dealNumber: task.deal?.number ?? null,
          dealTitle: task.deal?.title ?? null,
        })),
      };
    });

    return {
      members,
      total: members.length,
      active: members.filter((member) => member.status === "ACTIVE").length,
      // Once branches are introduced, LEAD will resolve to their branch subtree here.
      scope: currentUser.organization.role === "LEAD" ? "OWN_TEAM" : "ORGANIZATION",
    };
  });

  app.post<{ Body: CreateTeamInvitationRequest; Reply: TeamInvitationLinkResponse | ApiErrorResponse }>("/team/invitations", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["name", "email", "role"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 160 },
          email: { type: "string", minLength: 3, maxLength: 320 },
          role: { type: "string", enum: ["LEAD", "MANAGER"] },
        },
      },
    },
  }, async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;
    if (currentUser.organization.role !== "ADMIN") {
      return reply.status(403).send({ error: "forbidden", message: "Приглашать сотрудников может только администратор." });
    }

    const email = request.body.email.trim().toLowerCase();
    const name = request.body.name.trim();
    if (!emailPattern.test(email)) return reply.status(400).send({ error: "invalid_email", message: "Укажите корректный email сотрудника." });

    const existingUser = await database.client.user.findUnique({
      where: { email },
      include: { memberships: true },
    });
    const existingMembership = existingUser?.memberships.find((membership) => membership.organizationId === currentUser.organization.id);
    if (existingUser?.memberships.some((membership) => membership.organizationId !== currentUser.organization.id && membership.status === "ACTIVE")) {
      return reply.status(409).send({ error: "account_in_another_workspace", message: "Этот email уже используется в другом рабочем пространстве. Поддержку нескольких организаций подключим отдельным этапом." });
    }
    if (existingMembership && existingMembership.status !== "INVITED") {
      return reply.status(409).send({ error: "member_exists", message: "Сотрудник с таким email уже состоит в команде." });
    }

    const token = createInvitationToken();
    const expiresAt = invitationExpiry();
    const invitation = await database.client.$transaction(async (transaction) => {
      const invitedUser = existingUser ?? await transaction.user.create({ data: { email, name } });
      if (existingUser && !existingUser.passwordHash) await transaction.user.update({ where: { id: existingUser.id }, data: { name } });
      await transaction.membership.upsert({
        where: { organizationId_userId: { organizationId: currentUser.organization.id, userId: invitedUser.id } },
        create: { organizationId: currentUser.organization.id, userId: invitedUser.id, role: request.body.role, status: "INVITED" },
        update: { role: request.body.role, status: "INVITED" },
      });
      await transaction.teamInvitation.updateMany({
        where: { organizationId: currentUser.organization.id, userId: invitedUser.id, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return transaction.teamInvitation.create({
        data: {
          organizationId: currentUser.organization.id,
          userId: invitedUser.id,
          invitedById: currentUser.id,
          tokenHash: hashInvitationToken(token),
          expiresAt,
        },
      });
    });

    return reply.status(201).send({ invitationId: invitation.id, connectUrl: invitationUrl(config, token), expiresAt: expiresAt.toISOString() });
  });

  app.post<{ Params: { invitationId: string }; Reply: TeamInvitationLinkResponse | ApiErrorResponse }>("/team/invitations/:invitationId/resend", {
    schema: { params: invitationIdParams },
  }, async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;
    if (currentUser.organization.role !== "ADMIN") return reply.status(403).send({ error: "forbidden", message: "Обновлять приглашения может только администратор." });
    const existing = await database.client.teamInvitation.findFirst({
      where: { id: request.params.invitationId, organizationId: currentUser.organization.id, acceptedAt: null, revokedAt: null },
    });
    if (!existing) return reply.status(404).send({ error: "invitation_not_found", message: "Активное приглашение не найдено." });
    const token = createInvitationToken();
    const expiresAt = invitationExpiry();
    const invitation = await database.client.teamInvitation.update({
      where: { id: existing.id },
      data: { tokenHash: hashInvitationToken(token), expiresAt },
    });
    return { invitationId: invitation.id, connectUrl: invitationUrl(config, token), expiresAt: expiresAt.toISOString() };
  });

  app.delete<{ Params: { invitationId: string }; Reply: { ok: true } | ApiErrorResponse }>("/team/invitations/:invitationId", {
    schema: { params: invitationIdParams },
  }, async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;
    if (currentUser.organization.role !== "ADMIN") return reply.status(403).send({ error: "forbidden", message: "Отменять приглашения может только администратор." });
    const invitation = await database.client.teamInvitation.findFirst({
      where: { id: request.params.invitationId, organizationId: currentUser.organization.id, acceptedAt: null, revokedAt: null },
    });
    if (!invitation) return reply.status(404).send({ error: "invitation_not_found", message: "Активное приглашение не найдено." });
    await database.client.$transaction([
      database.client.teamInvitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } }),
      database.client.membership.deleteMany({ where: { organizationId: currentUser.organization.id, userId: invitation.userId, status: "INVITED" } }),
    ]);
    return { ok: true };
  });
}
