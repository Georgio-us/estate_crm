import type { InboundLeadResult, IntegrationProvider } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { parsePhone } from "../lib/phone.js";

export interface CanonicalInboundLead {
  provider: Exclude<IntegrationProvider, "TELEGRAM">;
  externalId: string;
  name: string;
  phone: string;
  message?: string;
  dealTitle?: string;
  adapter?: string;
  createdAt?: string;
  metadata?: Record<string, string | number | boolean>;
}

export class InvalidInboundLeadError extends Error {}

function duplicateResult(event: { id: string; contactId: string | null; dealId: string | null; deal: { number: number } | null }): InboundLeadResult | null {
  if (!event.contactId || !event.dealId || !event.deal) return null;
  return { eventId: event.id, contactId: event.contactId, dealId: event.dealId, dealNumber: event.deal.number, duplicate: true, reusedContact: true, reusedDeal: true, notificationQueued: false };
}

const providerLabels: Record<CanonicalInboundLead["provider"], string> = {
  TEST: "Тестовый шлюз",
  META_LEAD_ADS: "Facebook Lead Ads",
  INSTAGRAM_DIRECT: "Instagram Direct",
  TELEPHONY: "Телефония",
};

export async function ingestInboundLead(
  database: DatabaseConnection,
  organizationId: string,
  lead: CanonicalInboundLead,
): Promise<InboundLeadResult> {
  const name = lead.name.trim();
  const phone = parsePhone(lead.phone);
  if (!name || !phone) throw new InvalidInboundLeadError("Укажите имя и корректный номер телефона.");

  const duplicate = await database.client.integrationEvent.findUnique({
    where: { organizationId_provider_externalId: { organizationId, provider: lead.provider, externalId: lead.externalId } },
    include: { deal: { select: { number: true } } },
  });
  const priorResult = duplicate ? duplicateResult(duplicate) : null;
  if (priorResult) return priorResult;

  try {
    return await database.client.$transaction(async (transaction) => {
    const connection = await transaction.integrationConnection.findUnique({
      where: { organizationId_provider: { organizationId, provider: lead.provider } },
    });
    const pipeline = connection?.pipelineId
      ? await transaction.pipeline.findFirst({ where: { id: connection.pipelineId, organizationId } })
      : await transaction.pipeline.findFirst({ where: { organizationId, isDefault: true }, orderBy: { createdAt: "asc" } });
    if (!pipeline) throw new InvalidInboundLeadError("Сначала создайте воронку.");

    const configuredStage = connection?.stageId
      ? await transaction.pipelineStage.findFirst({ where: { id: connection.stageId, pipelineId: pipeline.id } })
      : null;
    const stage = configuredStage ?? await transaction.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id },
      orderBy: { position: "asc" },
    });
    if (!stage) throw new InvalidInboundLeadError("В воронке нет этапов для новых обращений.");

    const payload = {
      name,
      phone: phone.formatted,
      message: lead.message?.trim() || null,
      adapter: lead.adapter ?? null,
      ...(lead.createdAt ? { createdAt: lead.createdAt } : {}),
      ...(lead.metadata ? { metadata: lead.metadata } : {}),
    };
    const event = await transaction.integrationEvent.create({
      data: {
        organizationId,
        connectionId: connection?.id,
        provider: lead.provider,
        externalId: lead.externalId,
        eventType: "lead.received",
        payload,
      },
    });

    let contact = await transaction.contact.findFirst({ where: { organizationId, normalizedPhone: phone.normalized } });
    const reusedContact = Boolean(contact);
    if (!contact) {
      contact = await transaction.contact.create({
        data: {
          organizationId,
          name,
          phone: phone.formatted,
          normalizedPhone: phone.normalized,
          source: lead.provider === "META_LEAD_ADS" || lead.provider === "INSTAGRAM_DIRECT" ? "META" : "MANUAL",
        },
      });
    }

    let deal = await transaction.deal.findFirst({
      where: { organizationId, contactId: contact.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
    });
    const reusedDeal = Boolean(deal);
    if (!deal) {
      deal = await transaction.deal.create({
        data: {
          organizationId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId: contact.id,
          title: lead.dealTitle?.trim() || lead.message?.trim() || name,
          request: lead.message?.trim() || "",
          source: lead.provider === "META_LEAD_ADS" || lead.provider === "INSTAGRAM_DIRECT" ? "META" : "MANUAL",
        },
      });
    }

    await transaction.activityEvent.create({
      data: {
        organizationId,
        contactId: contact.id,
        dealId: deal.id,
        category: "SOURCE",
        title: reusedDeal ? "Повторное обращение" : "Обращение из интеграции",
        description: `${providerLabels[lead.provider]}${lead.message?.trim() ? `: ${lead.message.trim()}` : ""}`,
      },
    });
    await transaction.notificationOutbox.create({
      data: {
        organizationId,
        channel: "TELEGRAM",
        eventType: reusedDeal ? "lead.repeated" : "lead.created",
        title: reusedDeal ? "Повторное обращение" : "Новый лид",
        body: `${providerLabels[lead.provider]} · ${name}`,
        actionUrl: `/?deal=${deal.id}`,
        payload: {
          provider: lead.provider,
          contactId: contact.id,
          dealId: deal.id,
          dealNumber: deal.number,
          assigneeId: deal.assigneeId,
        },
      },
    });
    await transaction.integrationEvent.update({
      where: { id: event.id },
      data: { status: "PROCESSED", contactId: contact.id, dealId: deal.id, processedAt: new Date() },
    });
    await transaction.integrationConnection.upsert({
      where: { organizationId_provider: { organizationId, provider: lead.provider } },
      create: {
        organizationId,
        provider: lead.provider,
        status: lead.provider === "TEST" ? "READY" : "CREDENTIALS_REQUIRED",
        enabled: lead.provider === "TEST",
        pipelineId: pipeline.id,
        stageId: stage.id,
        lastEventAt: new Date(),
      },
      update: { lastEventAt: new Date(), lastError: null },
    });

    return {
      eventId: event.id,
      contactId: contact.id,
      dealId: deal.id,
      dealNumber: deal.number,
      duplicate: false,
      reusedContact,
      reusedDeal,
      notificationQueued: true,
    };
    });
  } catch (error) {
    const concurrentDuplicate = await database.client.integrationEvent.findUnique({
      where: { organizationId_provider_externalId: { organizationId, provider: lead.provider, externalId: lead.externalId } },
      include: { deal: { select: { number: true } } },
    });
    const result = concurrentDuplicate ? duplicateResult(concurrentDuplicate) : null;
    if (result) return result;
    throw error;
  }
}
