import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  CreateTeamInvitationRequest,
  TeamAuditResponse,
  TeamAssigneeListResponse,
  TeamInvitationLinkResponse,
  TeamResponse,
  TelegramNotificationAudience,
  TelegramNotificationPreferencesResponse,
  UpdateTeamMemberRequest,
  UpdateTelegramNotificationPreferencesRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "../config.js";
import { requireUser } from "../auth/require-user.js";
import { parsePhone } from "../lib/phone.js";
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
const memberIdParams = {
  type: "object",
  required: ["memberId"],
  properties: { memberId: { type: "string", format: "uuid" } },
} as const;

const memberUpdateBody = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160 },
    phone: { anyOf: [{ type: "string", maxLength: 40 }, { type: "null" }] },
    role: { type: "string", enum: ["ADMIN", "LEAD", "MANAGER"] },
    status: { type: "string", enum: ["ACTIVE", "SUSPENDED"] },
    confirmAssignedWork: { type: "boolean" },
  },
} as const;

const notificationPreferencesBody = {
  type: "object",
  additionalProperties: false,
  required: ["audience", "leadNotifications", "taskReminderNotifications", "taskOverdueNotifications", "selectedUserIds"],
  properties: {
    audience: { type: "string", enum: ["ALL", "OWN", "SELECTED", "NONE"] },
    leadNotifications: { type: "boolean" },
    taskReminderNotifications: { type: "boolean" },
    taskOverdueNotifications: { type: "boolean" },
    selectedUserIds: { type: "array", uniqueItems: true, maxItems: 500, items: { type: "string", format: "uuid" } },
  },
} as const;

function defaultAudience(role: "ADMIN" | "LEAD" | "MANAGER"): TelegramNotificationAudience {
  return role === "ADMIN" ? "ALL" : "OWN";
}

function roleLabel(role: "ADMIN" | "LEAD" | "MANAGER") {
  return role === "ADMIN" ? "Администратор" : role === "LEAD" ? "Руководитель" : "Менеджер";
}

function canManageNotifications(actor: { id: string; organization: { role: "ADMIN" | "LEAD" | "MANAGER" } }, target: { userId: string; role: "ADMIN" | "LEAD" | "MANAGER" }) {
  return actor.id === target.userId || actor.organization.role === "ADMIN" || (actor.organization.role === "LEAD" && target.role !== "ADMIN");
}

function invitationUrl(config: ApiConfig, token: string) {
  return `${config.webAppUrl || "http://localhost:3000"}/invite/${token}`;
}

export async function registerTeamRoutes(app: FastifyInstance, config: ApiConfig, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: TeamAssigneeListResponse | ApiErrorResponse }>("/team/assignees", async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;

    const memberships = await database.client.membership.findMany({
      where: {
        organizationId: currentUser.organization.id,
        status: "ACTIVE",
        ...(currentUser.organization.role === "MANAGER" ? { userId: currentUser.id } : {}),
      },
      select: {
        role: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      assignees: memberships.map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
        role: membership.role,
      })),
    };
  });

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

  app.patch<{ Params: { memberId: string }; Body: UpdateTeamMemberRequest; Reply: { ok: true } | ApiErrorResponse }>("/team/:memberId", {
    schema: { params: memberIdParams, body: memberUpdateBody },
  }, async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;
    if (currentUser.organization.role !== "ADMIN") {
      return reply.status(403).send({ error: "forbidden", message: "Изменять сотрудников может только администратор." });
    }

    const organizationId = currentUser.organization.id;
    const membership = await database.client.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId: request.params.memberId } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            _count: {
              select: {
                assignedDeals: { where: { organizationId, status: "ACTIVE" } },
                assignedTasks: { where: { organizationId, status: "ACTIVE" } },
              },
            },
          },
        },
      },
    });
    if (!membership) return reply.status(404).send({ error: "member_not_found", message: "Сотрудник не найден." });
    if (membership.status === "INVITED") return reply.status(409).send({ error: "invitation_pending", message: "Сначала сотрудник должен принять приглашение." });

    const nextStatus = request.body.status ?? membership.status;
    const nextRole = request.body.role ?? membership.role;
    const removingAdmin = membership.role === "ADMIN" && (nextRole !== "ADMIN" || nextStatus === "SUSPENDED");
    if (request.params.memberId === currentUser.id && nextStatus === "SUSPENDED") {
      return reply.status(409).send({ error: "cannot_suspend_self", message: "Нельзя отключить собственный доступ." });
    }
    if (request.params.memberId === currentUser.id && nextRole !== membership.role) {
      return reply.status(409).send({ error: "cannot_change_own_role", message: "Собственную роль должен изменить другой администратор." });
    }
    if (removingAdmin) {
      const activeAdmins = await database.client.membership.count({ where: { organizationId, role: "ADMIN", status: "ACTIVE" } });
      if (activeAdmins <= 1) return reply.status(409).send({ error: "last_admin", message: "В команде должен остаться хотя бы один активный администратор." });
    }
    const assignedWork = membership.user._count.assignedDeals + membership.user._count.assignedTasks;
    if (membership.status === "ACTIVE" && nextStatus === "SUSPENDED" && assignedWork > 0 && !request.body.confirmAssignedWork) {
      return reply.status(409).send({
        error: "assigned_work_confirmation_required",
        message: `У сотрудника осталось ${membership.user._count.assignedDeals} активных сделок и ${membership.user._count.assignedTasks} задач. Подтвердите отключение.`,
      });
    }

    const rawPhone = request.body.phone?.trim() || null;
    const parsedPhone = rawPhone ? parsePhone(rawPhone) : null;
    if (rawPhone && !parsedPhone) return reply.status(400).send({ error: "invalid_phone", message: "Введите корректный номер телефона." });
    const nextName = request.body.name?.trim() ?? membership.user.name;
    const nextPhone = request.body.phone === undefined ? membership.user.phone : parsedPhone?.formatted ?? null;
    const changes = [
      nextName !== membership.user.name ? `Имя: «${membership.user.name}» → «${nextName}»` : null,
      nextPhone !== membership.user.phone ? `Телефон ${nextPhone ? "обновлён" : "удалён"}` : null,
      nextRole !== membership.role ? `Роль: «${roleLabel(membership.role)}» → «${roleLabel(nextRole)}»` : null,
      nextStatus !== membership.status ? (nextStatus === "SUSPENDED" ? "Доступ отключён" : "Доступ восстановлен") : null,
    ].filter((value): value is string => Boolean(value));
    if (!changes.length) return { ok: true };

    await database.client.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id: membership.userId }, data: { name: nextName, phone: nextPhone } });
      await transaction.membership.update({ where: { id: membership.id }, data: { role: nextRole, status: nextStatus } });
      if (nextStatus === "SUSPENDED") {
        await transaction.session.deleteMany({ where: { userId: membership.userId } });
        await transaction.telegramRecipient.updateMany({ where: { organizationId, userId: membership.userId }, data: { active: false } });
      } else if (membership.status === "SUSPENDED") {
        await transaction.telegramRecipient.updateMany({ where: { organizationId, userId: membership.userId }, data: { active: true } });
      }
      if (nextRole === "MANAGER") {
        const recipient = await transaction.telegramRecipient.findUnique({ where: { organizationId_userId: { organizationId, userId: membership.userId } } });
        if (recipient) {
          await transaction.telegramRecipient.update({ where: { id: recipient.id }, data: { scope: "OWN", audience: recipient.audience === "NONE" ? "NONE" : "OWN" } });
          await transaction.telegramRecipientSelection.deleteMany({ where: { recipientId: recipient.id } });
        }
      }
      await transaction.activityEvent.create({
        data: { organizationId, authorId: currentUser.id, category: "CHANGE", title: `Изменён участник: ${nextName}`, description: changes.join(" · ") },
      });
    });
    return { ok: true };
  });

  app.get<{ Reply: TeamAuditResponse | ApiErrorResponse }>("/team/audit", async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;
    if (currentUser.organization.role === "MANAGER") return reply.status(403).send({ error: "forbidden", message: "Журнал команды недоступен менеджеру." });
    const events = await database.client.activityEvent.findMany({
      where: { organizationId: currentUser.organization.id, contactId: null, dealId: null, category: "CHANGE", title: { startsWith: "Изменён участник:" } },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { events: events.map((event) => ({ id: event.id, title: event.title, description: event.description, occurredAt: event.createdAt.toISOString(), author: event.author })) };
  });

  app.get<{ Params: { memberId: string }; Reply: TelegramNotificationPreferencesResponse | ApiErrorResponse }>("/team/:memberId/notifications", {
    schema: { params: memberIdParams },
  }, async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;
    const organizationId = currentUser.organization.id;
    const target = await database.client.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: request.params.memberId } }, include: { user: { select: { name: true } } } });
    if (!target) return reply.status(404).send({ error: "member_not_found", message: "Сотрудник не найден." });
    if (!canManageNotifications(currentUser, target)) return reply.status(403).send({ error: "forbidden", message: "Недостаточно прав для настройки уведомлений этого сотрудника." });
    const [recipient, memberships] = await Promise.all([
      database.client.telegramRecipient.findUnique({ where: { organizationId_userId: { organizationId, userId: target.userId } }, include: { selectedUsers: { select: { userId: true } } } }),
      database.client.membership.findMany({ where: { organizationId, status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    return {
      connected: Boolean(recipient?.active), role: target.role, audience: recipient?.audience ?? defaultAudience(target.role),
      leadNotifications: recipient?.leadNotifications ?? true, taskReminderNotifications: recipient?.taskReminderNotifications ?? true,
      taskOverdueNotifications: recipient?.taskOverdueNotifications ?? true, selectedUserIds: recipient?.selectedUsers.map((item) => item.userId) ?? [],
      members: memberships.map((item) => ({ id: item.user.id, name: item.user.name, role: item.role })),
    };
  });

  app.patch<{ Params: { memberId: string }; Body: UpdateTelegramNotificationPreferencesRequest; Reply: TelegramNotificationPreferencesResponse | ApiErrorResponse }>("/team/:memberId/notifications", {
    schema: { params: memberIdParams, body: notificationPreferencesBody },
  }, async (request, reply) => {
    const currentUser = await requireUser(request, reply, database);
    if (!currentUser) return reply;
    const organizationId = currentUser.organization.id;
    const target = await database.client.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: request.params.memberId } }, include: { user: { select: { name: true } } } });
    if (!target) return reply.status(404).send({ error: "member_not_found", message: "Сотрудник не найден." });
    if (!canManageNotifications(currentUser, target)) return reply.status(403).send({ error: "forbidden", message: "Недостаточно прав для настройки уведомлений этого сотрудника." });
    const recipient = await database.client.telegramRecipient.findUnique({ where: { organizationId_userId: { organizationId, userId: target.userId } } });
    if (!recipient?.active) return reply.status(409).send({ error: "telegram_not_connected", message: "Сотрудник ещё не подключил Telegram." });
    if (target.role === "MANAGER" && !["OWN", "NONE"].includes(request.body.audience)) return reply.status(403).send({ error: "forbidden", message: "Менеджеру доступны только собственные уведомления." });
    const selectedUserIds = request.body.audience === "SELECTED" && target.role !== "MANAGER" ? request.body.selectedUserIds : [];
    if (selectedUserIds.length) {
      const count = await database.client.membership.count({ where: { organizationId, status: "ACTIVE", userId: { in: selectedUserIds } } });
      if (count !== selectedUserIds.length) return reply.status(400).send({ error: "invalid_team_selection", message: "В списке есть сотрудник без активного доступа." });
    }
    await database.client.$transaction(async (transaction) => {
      await transaction.telegramRecipient.update({ where: { id: recipient.id }, data: { audience: request.body.audience, leadNotifications: request.body.leadNotifications, taskReminderNotifications: request.body.taskReminderNotifications, taskOverdueNotifications: request.body.taskOverdueNotifications } });
      await transaction.telegramRecipientSelection.deleteMany({ where: { recipientId: recipient.id } });
      if (selectedUserIds.length) await transaction.telegramRecipientSelection.createMany({ data: selectedUserIds.map((userId) => ({ recipientId: recipient.id, userId })), skipDuplicates: true });
      await transaction.activityEvent.create({ data: { organizationId, authorId: currentUser.id, category: "CHANGE", title: `Изменён участник: ${target.user.name}`, description: `Настроены Telegram-уведомления: ${request.body.audience}` } });
    });
    const memberships = await database.client.membership.findMany({ where: { organizationId, status: "ACTIVE" }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } });
    return { connected: true, role: target.role, audience: request.body.audience, leadNotifications: request.body.leadNotifications, taskReminderNotifications: request.body.taskReminderNotifications, taskOverdueNotifications: request.body.taskOverdueNotifications, selectedUserIds, members: memberships.map((item) => ({ id: item.user.id, name: item.user.name, role: item.role })) };
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
