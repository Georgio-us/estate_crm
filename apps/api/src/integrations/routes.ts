import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  GoogleSheetsIntegrationSetupResponse,
  GoogleSheetsMetaLeadRequest,
  InboundLeadResult,
  IntegrationsResponse,
  TestInboundLeadRequest,
  UpdateIntegrationConnectionRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import { ingestInboundLead, InvalidInboundLeadError } from "./service.js";

const providers = ["TEST", "META_LEAD_ADS", "INSTAGRAM_DIRECT", "TELEPHONY", "TELEGRAM"] as const;

function hashWebhookSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function webhookSecretMatches(storedHash: string | null, candidate: string): boolean {
  if (!storedHash || !/^[a-f0-9]{64}$/.test(storedHash) || !candidate) return false;
  const candidateHash = hashWebhookSecret(candidate);
  return timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(candidateHash, "hex"));
}

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
          webhookConfigured: Boolean(item?.webhookSecretHash),
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

  app.post<{ Reply: GoogleSheetsIntegrationSetupResponse | ApiErrorResponse }>("/integrations/meta-lead-ads/google-sheets/setup", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (user.organization.role === "MANAGER") {
      return reply.status(403).send({ error: "forbidden", message: "Подключать источники может руководитель или администратор." });
    }

    const organizationId = user.organization.id;
    const existing = await database.client.integrationConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider: "META_LEAD_ADS" } },
    });
    const pipeline = existing?.pipelineId
      ? await database.client.pipeline.findFirst({ where: { id: existing.pipelineId, organizationId } })
      : await database.client.pipeline.findFirst({ where: { organizationId, isDefault: true }, orderBy: { createdAt: "asc" } });
    if (!pipeline) return reply.status(400).send({ error: "pipeline_required", message: "Сначала создайте воронку." });

    const configuredStage = existing?.stageId
      ? await database.client.pipelineStage.findFirst({ where: { id: existing.stageId, pipelineId: pipeline.id } })
      : null;
    const stage = configuredStage ?? await database.client.pipelineStage.findFirst({ where: { pipelineId: pipeline.id }, orderBy: { position: "asc" } });
    if (!stage) return reply.status(400).send({ error: "stage_required", message: "В воронке нет этапов для новых обращений." });

    const secret = randomBytes(32).toString("base64url");
    const connection = await database.client.integrationConnection.upsert({
      where: { organizationId_provider: { organizationId, provider: "META_LEAD_ADS" } },
      create: {
        organizationId,
        provider: "META_LEAD_ADS",
        status: "CONNECTED",
        enabled: true,
        pipelineId: pipeline.id,
        stageId: stage.id,
        config: { transport: "GOOGLE_SHEETS" },
        webhookSecretHash: hashWebhookSecret(secret),
      },
      update: {
        status: "CONNECTED",
        enabled: true,
        pipelineId: pipeline.id,
        stageId: stage.id,
        config: { transport: "GOOGLE_SHEETS" },
        webhookSecretHash: hashWebhookSecret(secret),
        lastError: null,
      },
    });

    return {
      connectionId: connection.id,
      webhookUrl: `${request.protocol}://${request.host}/webhooks/google-sheets/meta-leads/${connection.id}`,
      secret,
    };
  });

  app.post<{
    Params: { connectionId: string };
    Body: GoogleSheetsMetaLeadRequest;
    Reply: { result: InboundLeadResult } | ApiErrorResponse;
  }>("/webhooks/google-sheets/meta-leads/:connectionId", {
    schema: {
      params: {
        type: "object",
        additionalProperties: false,
        required: ["connectionId"],
        properties: { connectionId: { type: "string", format: "uuid" } },
      },
      body: {
        type: "object",
        additionalProperties: false,
        required: ["externalId", "name", "phone"],
        properties: {
          externalId: { type: "string", minLength: 1, maxLength: 200 },
          name: { type: "string", minLength: 1, maxLength: 200 },
          phone: { type: "string", minLength: 1, maxLength: 50 },
          message: { type: "string", maxLength: 4000 },
          createdAt: { type: "string", maxLength: 100 },
          metadata: {
            type: "object",
            additionalProperties: false,
            properties: {
              campaignId: { type: "string", maxLength: 200 },
              campaignName: { type: "string", maxLength: 500 },
              adsetId: { type: "string", maxLength: 200 },
              adsetName: { type: "string", maxLength: 500 },
              adId: { type: "string", maxLength: 200 },
              adName: { type: "string", maxLength: 500 },
              formId: { type: "string", maxLength: 200 },
              formName: { type: "string", maxLength: 500 },
              platform: { type: "string", maxLength: 50 },
              isOrganic: { type: "boolean" },
              leadStatus: { type: "string", maxLength: 100 },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const connection = await database.client.integrationConnection.findFirst({
      where: {
        id: request.params.connectionId,
        provider: "META_LEAD_ADS",
        enabled: true,
        status: "CONNECTED",
      },
    });
    const suppliedSecret = typeof request.headers["x-estate-crm-secret"] === "string"
      ? request.headers["x-estate-crm-secret"].trim()
      : "";
    if (!connection || !webhookSecretMatches(connection.webhookSecretHash, suppliedSecret)) {
      return reply.status(401).send({ error: "invalid_webhook_credentials", message: "Неверные реквизиты входящего подключения." });
    }

    try {
      const result = await ingestInboundLead(database, connection.organizationId, {
        provider: "META_LEAD_ADS",
        externalId: request.body.externalId,
        name: request.body.name,
        phone: request.body.phone,
        message: request.body.message,
        dealTitle: request.body.metadata?.formName && request.body.metadata.formName !== "-"
          ? `Meta · ${request.body.metadata.formName}`
          : request.body.name,
        adapter: "google-sheets",
        createdAt: request.body.createdAt,
        metadata: request.body.metadata,
      });
      return reply.status(result.duplicate ? 200 : 201).send({ result });
    } catch (error) {
      if (error instanceof InvalidInboundLeadError) {
        await database.client.integrationConnection.update({ where: { id: connection.id }, data: { lastError: error.message } });
        return reply.status(400).send({ error: "invalid_inbound_lead", message: error.message });
      }
      throw error;
    }
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
