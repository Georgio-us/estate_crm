import type { FastifyInstance } from "fastify";

import type { ApiErrorResponse, DashboardResponse } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { dataScope, hasOrganizationWideDataAccess } from "../auth/authorization.js";
import { requireUser } from "../auth/require-user.js";

export async function registerDashboardRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: DashboardResponse | ApiErrorResponse }>("/dashboard", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const organizationId = user.organization.id;
    const [pipeline, contactCount, availablePropertyCount, activities] = await Promise.all([
      database.client.pipeline.findFirst({
        where: { organizationId, isDefault: true },
        orderBy: { createdAt: "asc" },
        include: {
          stages: {
            orderBy: { position: "asc" },
            include: {
              deals: {
                where: { status: "ACTIVE", ...(hasOrganizationWideDataAccess(user) ? {} : { assigneeId: user.id }) },
                select: {
                  id: true,
                  assigneeId: true,
                  tasks: { where: { status: "ACTIVE" }, take: 1, select: { id: true } },
                },
              },
            },
          },
        },
      }),
      database.client.contact.count({ where: dataScope(user) }),
      database.client.property.count({ where: { organizationId, status: "AVAILABLE" } }),
      database.client.activityEvent.findMany({
        where: {
          organizationId,
          ...(hasOrganizationWideDataAccess(user) ? {} : {
            OR: [
              { deal: { assigneeId: user.id } },
              { dealId: null, contact: { assigneeId: user.id } },
            ],
          }),
        },
        include: {
          author: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
          deal: { select: { id: true, number: true, title: true, contact: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const stages = pipeline?.stages ?? [];
    const deals = stages.flatMap((stage) => stage.deals);

    return {
      deals: {
        total: deals.length,
        unassigned: deals.filter((deal) => !deal.assigneeId).length,
        withoutTask: deals.filter((deal) => deal.tasks.length === 0).length,
      },
      contacts: { total: contactCount },
      properties: { available: availablePropertyCount },
      stages: stages.map((stage) => ({ id: stage.id, title: stage.title, color: stage.color, position: stage.position, dealCount: stage.deals.length })),
      activities: activities.map((activity) => ({
        id: activity.id,
        contactId: activity.contactId,
        dealId: activity.dealId,
        category: activity.category,
        title: activity.title,
        description: activity.description,
        author: activity.author,
        occurredAt: activity.createdAt.toISOString(),
        contactName: activity.deal?.contact.name ?? activity.contact?.name ?? null,
        dealNumber: activity.deal?.number ?? null,
        dealTitle: activity.deal?.title ?? null,
      })),
    };
  });
}
