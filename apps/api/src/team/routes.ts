import type { FastifyInstance } from "fastify";

import type { ApiErrorResponse, TeamResponse } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";

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

export async function registerTeamRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
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
    const memberships = await database.client.membership.findMany({
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
    });

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
}
