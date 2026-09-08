import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { ApiErrorResponse, InboundLeadResult, IntegrationsResponse, TestInboundLeadRequest, UpdateIntegrationConnectionRequest } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import { ingestInboundLead, InvalidInboundLeadError } from "./service.js";

const providers = ["TEST", "META_LEAD_ADS", "INSTAGRAM_DIRECT", "TELEPHONY", "TELEGRAM"] as const;

export async function registerIntegrationRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.get<{ Reply: IntegrationsResponse | ApiErrorResponse }>("/integrations", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const organizationId = user.organization.id;
    const [connections, events, pendingNotifications, processedGroups] = await Promise.all([
      database.client.integrationConnection.findMany({ where: { organizationId } }),
      database.client.integrationEvent.findMany({
        where: { organizationId }, orderBy: { receivedAt: "desc" }, take: 20,
        include: { contact: { select: { name: true } }, deal: { select: { number: true } } },
      }),
      database.client.notificationOutbox.count({ where: { organizationId, status: "PENDING" } }),
      database.client.integrationEvent.groupBy({ by: ["provider"], where: { organizationId, status: "PROCESSED" }, _count: { _all: true } }),
    ]);
    const byProvider = new Map(connections.map((item) => [item.provider, item]));
    const counts = new Map(processedGroups.map((item) => [item.provider, item._count._all]));

    return {
      connections: providers.map((provider) => {
        const item = byProvider.get(provider);
        return {
          provider,
          status: item?.status ?? (provider === "TEST" ? "READY" : "CREDENTIALS_REQUIRED"),
          enabled: item?.enabled ?? provider === "TEST",
          pipelineId: item?.pipelineId ?? null,
          stageId: item?.stageId ?? null,
          lastEventAt: item?.lastEventAt?.toISOString() ?? null,
          lastError: item?.lastError ?? null,
          processedCount: counts.get(provider) ?? 0,
        };
      }),
      events: events.map((event) => ({
        id: event.id, provider: event.provider, externalId: event.externalId, eventType: event.eventType,
        status: event.status, contactId: event.contactId, contactName: event.contact?.name ?? null,
        dealId: event.dealId, dealNumber: event.deal?.number ?? null,
        receivedAt: event.receivedAt.toISOString(), processedAt: event.processedAt?.toISOString() ?? null,
      })),
      pendingNotifications,
    };
  });

  app.post<{ Body: TestInboundLeadRequest; Reply: { result: InboundLeadResult } | ApiErrorResponse }>("/integrations/test-lead", {
    schema: { body: { type: "object", additionalProperties: false, required: ["provider", "name", "phone"], properties: {
      provider: { type: "string", enum: ["TEST", "META_LEAD_ADS", "INSTAGRAM_DIRECT", "TELEPHONY"] },
      externalId: { type: "string", minLength: 1, maxLength: 200 }, name: { type: "string", minLength: 1, maxLength: 200 },
      phone: { type: "string", minLength: 1, maxLength: 50 }, message: { type: "string", maxLength: 2000 },
    } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (user.organization.role === "MANAGER") return reply.status(403).send({ error: "forbidden", message: "Тестировать входящие интеграции может руководитель или администратор." });
    try {
      const result = await ingestInboundLead(database, user.organization.id, {
        provider: request.body.provider,
        externalId: request.body.externalId?.trim() || randomUUID(),
        name: request.body.name,
        phone: request.body.phone,
        message: request.body.message,
        adapter: "authenticated-test-interface",
      });
      return reply.status(result.duplicate ? 200 : 201).send({ result });
    } catch (error) {
      if (error instanceof InvalidInboundLeadError) return reply.status(400).send({ error: "invalid_inbound_lead", message: error.message });
      throw error;
    }
  });

  app.patch<{ Params: { provider: typeof providers[number] }; Body: UpdateIntegrationConnectionRequest; Reply: { saved: true } | ApiErrorResponse }>("/integrations/:provider", {
    schema: {
      params: { type: "object", additionalProperties: false, required: ["provider"], properties: { provider: { type: "string", enum: [...providers] } } },
      body: { type: "object", additionalProperties: false, required: ["pipelineId", "stageId"], properties: { pipelineId: { type: "string", format: "uuid" }, stageId: { type: "string", format: "uuid" } } },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (user.organization.role === "MANAGER") return reply.status(403).send({ error: "forbidden", message: "Настраивать интеграции может руководитель или администратор." });
    const stage = await database.client.pipelineStage.findFirst({
      where: { id: request.body.stageId, pipelineId: request.body.pipelineId, pipeline: { organizationId: user.organization.id } },
      select: { id: true },
    });
    if (!stage) return reply.status(400).send({ error: "invalid_integration_stage", message: "Этап не принадлежит выбранной воронке." });
    await database.client.integrationConnection.upsert({
      where: { organizationId_provider: { organizationId: user.organization.id, provider: request.params.provider } },
      create: {
        organizationId: user.organization.id, provider: request.params.provider,
        status: request.params.provider === "TEST" ? "READY" : "CREDENTIALS_REQUIRED",
        enabled: request.params.provider === "TEST", pipelineId: request.body.pipelineId, stageId: request.body.stageId,
      },
      update: { pipelineId: request.body.pipelineId, stageId: request.body.stageId },
    });
    return { saved: true };
  });
}
