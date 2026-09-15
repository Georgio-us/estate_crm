import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { ApiErrorResponse } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "../../config.js";
import { canConfigureOrganization, dealScope } from "../../auth/authorization.js";
import { requireUser } from "../../auth/require-user.js";
import { ViaRemoteClient, ViaRemoteError, viaBaseUrl } from "./client.js";
import { decryptViaCredential, encryptViaCredential, readViaEncryptionKey, verifyViaRequestSignature } from "./security.js";

const pairingLifetimeMs = 10 * 60_000;
const claimAttempts = new Map<string, { count: number; resetAt: number }>();
const eventTypes = ["telegram.identity_seen", "selection.opened", "property.viewed", "mini_app_lead.created", "session.completed_summary"] as const;
type ViaEventType = typeof eventTypes[number];
type ViaCatalogItem = { externalId: string; title: string; active: boolean; updatedAt?: string; operation?: string; propertyType?: string; price?: number | null; currency?: string | null; rooms?: string | null; areaM2?: number | null; district?: string | null; previewImageUrl?: string | null };
type ViaCatalog = { items: ViaCatalogItem[]; nextCursor: string | null };
type ViaSelectionReply = { selectionId: string; shareUrl: string; acceptedPropertyExternalIds: string[]; unavailablePropertyExternalIds: string[] };
type ViaEvent = { eventId: string; connectionId: string; type: ViaEventType; occurredAt: string; viaTenant: string; selectionId?: string; externalSelectionId?: string; crmContextId?: string; telegram?: { userId: string | number; username?: string; firstName?: string; lastName?: string }; propertyExternalId?: string; lead?: { viaLeadId: string; source?: string; name?: string; phone?: string; email?: string; comment?: string }; session?: { sessionId: string; summary?: string; durationSec?: number } };

function codeHash(code: string): string { return createHash("sha256").update(code).digest("hex"); }
function errorMessage(error: unknown): string { return error instanceof ViaRemoteError ? error.message : "Via временно недоступен. Повторите позже."; }
function eventDescription(event: ViaEvent): string | null {
  if (event.type === "property.viewed") return event.propertyExternalId ? `Объект Via: ${event.propertyExternalId.slice(0, 120)}` : null;
  if (event.type === "session.completed_summary") return event.session?.summary?.trim().slice(0, 1_000) || null;
  if (event.type === "mini_app_lead.created") return event.lead?.comment?.trim().slice(0, 500) || null;
  return null;
}
const eventTitles: Record<ViaEventType, string> = {
  "telegram.identity_seen": "Клиент открыл Via в Telegram",
  "selection.opened": "Клиент открыл подборку Via",
  "property.viewed": "Клиент посмотрел объект Via",
  "mini_app_lead.created": "Клиент оставил заявку в Via",
  "session.completed_summary": "Via передал самари диалога",
};

export function parseViaEvent(value: unknown): ViaEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Partial<ViaEvent>;
  if (typeof event.eventId !== "string" || !event.eventId || event.eventId.length > 120
    || typeof event.connectionId !== "string" || !/^[0-9a-f-]{36}$/i.test(event.connectionId)
    || typeof event.viaTenant !== "string" || !event.viaTenant || event.viaTenant.length > 120
    || !eventTypes.includes(event.type as ViaEventType) || typeof event.occurredAt !== "string"
    || !Number.isFinite(Date.parse(event.occurredAt))) return null;
  const trimmed = (text: unknown, max: number) => typeof text === "string" ? text.trim().slice(0, max) : undefined;
  const telegram = event.telegram && typeof event.telegram === "object" && !Array.isArray(event.telegram) && event.telegram.userId != null
    ? { userId: String(event.telegram.userId).slice(0, 30), username: trimmed(event.telegram.username, 120), firstName: trimmed(event.telegram.firstName, 120), lastName: trimmed(event.telegram.lastName, 120) }
    : undefined;
  const lead = event.lead && typeof event.lead === "object" && !Array.isArray(event.lead) && typeof event.lead.viaLeadId === "string"
    ? { viaLeadId: event.lead.viaLeadId.slice(0, 120), source: trimmed(event.lead.source, 80), name: trimmed(event.lead.name, 200), phone: trimmed(event.lead.phone, 60), email: trimmed(event.lead.email, 200), comment: trimmed(event.lead.comment, 500) }
    : undefined;
  const session = event.session && typeof event.session === "object" && !Array.isArray(event.session) && typeof event.session.sessionId === "string"
    ? { sessionId: event.session.sessionId.slice(0, 120), summary: trimmed(event.session.summary, 1_000), durationSec: typeof event.session.durationSec === "number" && Number.isFinite(event.session.durationSec) ? Math.max(0, Math.min(event.session.durationSec, 86_400)) : undefined }
    : undefined;
  return { eventId: event.eventId, connectionId: event.connectionId, type: event.type as ViaEventType, occurredAt: event.occurredAt, viaTenant: event.viaTenant,
    selectionId: trimmed(event.selectionId, 120), externalSelectionId: trimmed(event.externalSelectionId, 120), crmContextId: trimmed(event.crmContextId, 120),
    telegram, propertyExternalId: trimmed(event.propertyExternalId, 120), lead, session };
}

function safeCatalog(value: unknown): ViaCatalog | null {
  if (!value || typeof value !== "object") return null;
  const catalog = value as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(catalog.items) || catalog.items.length > 100 || (catalog.nextCursor != null && typeof catalog.nextCursor !== "string")) return null;
  const items: ViaCatalogItem[] = [];
  for (const item of catalog.items) {
    if (!item || typeof item !== "object") return null;
    const candidate = item as Partial<ViaCatalogItem>;
    if (typeof candidate.externalId !== "string" || !candidate.externalId || typeof candidate.title !== "string" || typeof candidate.active !== "boolean") return null;
    items.push({ externalId: candidate.externalId.slice(0, 120), title: candidate.title.slice(0, 300), active: candidate.active,
      updatedAt: candidate.updatedAt, operation: candidate.operation, propertyType: candidate.propertyType,
      price: candidate.price, currency: candidate.currency, rooms: candidate.rooms, areaM2: candidate.areaM2,
      district: candidate.district, previewImageUrl: candidate.previewImageUrl });
  }
  return { items, nextCursor: catalog.nextCursor as string | null || null };
}

const dealParams = { type: "object", required: ["dealId"], properties: { dealId: { type: "string", format: "uuid" } } } as const;
const shareParams = { type: "object", required: ["dealId", "selectionId"], properties: { dealId: { type: "string", format: "uuid" }, selectionId: { type: "string", format: "uuid" } } } as const;

export async function registerViaIntegrationRoutes(app: FastifyInstance, config: ApiConfig, database: DatabaseConnection): Promise<void> {
  const key = readViaEncryptionKey(config.viaEncryptionKey);
  const base = viaBaseUrl(config);

  async function connectionFor(organizationId: string) {
    return database.client.integrationConnection.findUnique({ where: { organizationId_provider: { organizationId, provider: "VIA" } } });
  }

  async function clientFor(organizationId: string): Promise<ViaRemoteClient | null> {
    const connection = await connectionFor(organizationId);
    if (!connection || !connection.enabled || connection.status !== "CONNECTED" || !connection.credentialCiphertext || !key || !base) return null;
    return new ViaRemoteClient(base, connection.id, decryptViaCredential(connection.credentialCiphertext, key));
  }

  app.get("/integrations/via/status", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const connection = await connectionFor(user.organization.id);
    const settings = connection?.config && typeof connection.config === "object" && !Array.isArray(connection.config) ? connection.config as { viaTenant?: string } : null;
    return { connected: Boolean(connection?.credentialCiphertext && connection?.status === "CONNECTED"), enabled: Boolean(connection?.enabled), viaTenant: settings?.viaTenant ?? null, lastEventAt: connection?.lastEventAt?.toISOString() ?? null };
  });

  app.post("/integrations/via/pairing/issue", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!canConfigureOrganization(user)) return reply.status(403).send({ error: "forbidden", message: "Подключать Via может администратор CRM." });
    if (!key || !base || !config.viaTenant || !config.publicApiUrl) return reply.status(503).send({ error: "via_not_configured", message: "Серверная настройка Via ещё не завершена." });
    const now = new Date();
    await database.client.viaPairing.updateMany({ where: { organizationId: user.organization.id, claimedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
    const pairingCode = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + pairingLifetimeMs);
    await database.client.viaPairing.create({ data: { organizationId: user.organization.id, issuedById: user.id, codeHash: codeHash(pairingCode), viaTenant: config.viaTenant, expiresAt } });
    return { pairingCode, viaTenant: config.viaTenant, expiresAt: expiresAt.toISOString() };
  });

  app.post<{ Body: { pairingCode: string; viaTenant: string; viaOrigin?: string; displayName?: string }; Reply: { connectionId: string; sharedCredential: string; eventEndpoint: string } | ApiErrorResponse }>("/integrations/via/pairing/claim", {
    schema: { body: { type: "object", additionalProperties: false, required: ["pairingCode", "viaTenant"], properties: { pairingCode: { type: "string", minLength: 30, maxLength: 80 }, viaTenant: { type: "string", minLength: 1, maxLength: 120 }, viaOrigin: { type: "string", maxLength: 500 }, displayName: { type: "string", maxLength: 120 } } } },
  }, async (request, reply) => {
    if (!key || !base || !config.viaTenant || !config.publicApiUrl) return reply.status(503).send({ error: "via_not_configured", message: "Серверная настройка Via ещё не завершена." });
    const nowMs = Date.now();
    const previous = claimAttempts.get(request.ip);
    const attempts = previous && previous.resetAt > nowMs ? previous : { count: 0, resetAt: nowMs + 60_000 };
    attempts.count += 1;
    claimAttempts.set(request.ip, attempts);
    if (claimAttempts.size > 1_000) for (const [ip, state] of claimAttempts) if (state.resetAt <= nowMs) claimAttempts.delete(ip);
    if (attempts.count > 20) return reply.status(429).send({ error: "pairing_rate_limited", message: "Слишком много попыток подключения Via. Повторите через минуту." });
    const pairing = await database.client.viaPairing.findUnique({ where: { codeHash: codeHash(request.body.pairingCode) } });
    if (!pairing || pairing.claimedAt || pairing.expiresAt <= new Date() || pairing.viaTenant !== request.body.viaTenant || pairing.viaTenant !== config.viaTenant) return reply.status(401).send({ error: "invalid_pairing", message: "Код подключения Via недействителен или истёк." });
    const sharedCredential = randomBytes(32).toString("base64url");
    const connection = await database.client.$transaction(async (tx) => {
      const consumed = await tx.viaPairing.updateMany({ where: { id: pairing.id, claimedAt: null, expiresAt: { gt: new Date() } }, data: { claimedAt: new Date() } });
      if (consumed.count !== 1) return null;
      return tx.integrationConnection.upsert({ where: { organizationId_provider: { organizationId: pairing.organizationId, provider: "VIA" } }, create: { organizationId: pairing.organizationId, provider: "VIA", status: "CONNECTED", enabled: true, config: { viaTenant: pairing.viaTenant }, credentialCiphertext: encryptViaCredential(sharedCredential, key) }, update: { status: "CONNECTED", enabled: true, config: { viaTenant: pairing.viaTenant }, credentialCiphertext: encryptViaCredential(sharedCredential, key), lastError: null } });
    });
    if (!connection) return reply.status(401).send({ error: "invalid_pairing", message: "Код подключения Via уже использован." });
    return { connectionId: connection.id, sharedCredential, eventEndpoint: `${config.publicApiUrl}/integrations/via/events` };
  });

  for (const enabled of [true, false]) app.post(`/integrations/via/${enabled ? "enable" : "disable"}`, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!canConfigureOrganization(user)) return reply.status(403).send({ error: "forbidden", message: "Настройкой Via управляет администратор CRM." });
    const connection = await connectionFor(user.organization.id);
    if (!connection?.credentialCiphertext || connection.status !== "CONNECTED") return reply.status(409).send({ error: "via_not_connected", message: "Сначала подключите Via." });
    await database.client.integrationConnection.update({ where: { id: connection.id }, data: { enabled } });
    return { enabled };
  });

  app.get<{ Querystring: { cursor?: string; updatedSince?: string }; Reply: ViaCatalog | ApiErrorResponse }>("/integrations/via/properties", {
    schema: { querystring: { type: "object", additionalProperties: false, properties: { cursor: { type: "string", maxLength: 500 }, updatedSince: { type: "string", maxLength: 100 } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const client = await clientFor(user.organization.id);
    if (!client) return reply.status(409).send({ error: "via_disabled", message: "Интеграция Via не подключена или выключена." });
    const query = new URLSearchParams();
    if (request.query.cursor) query.set("cursor", request.query.cursor);
    if (request.query.updatedSince) query.set("updatedSince", request.query.updatedSince);
    try {
      const result = safeCatalog(await client.request<unknown>("GET", `/api/integrations/estate/v1/properties${query.size ? `?${query}` : ""}`));
      if (!result) return reply.status(502).send({ error: "invalid_via_catalog", message: "Via вернул некорректный каталог." });
      return result;
    } catch (error) { return reply.status(502).send({ error: "via_unavailable", message: errorMessage(error) }); }
  });

  app.get<{ Params: { dealId: string } }>("/deals/:dealId/via-selections", { schema: { params: dealParams } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const deal = await database.client.deal.findFirst({ where: { id: request.params.dealId, ...dealScope(user) }, select: { id: true } });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });
    const selections = await database.client.viaSharedSelection.findMany({ where: { dealId: deal.id, organizationId: user.organization.id }, orderBy: { createdAt: "desc" } });
    return { selections: selections.map((selection) => ({ ...selection, propertyExternalIds: selection.propertyExternalIds as string[], createdAt: selection.createdAt.toISOString(), sentAt: selection.sentAt?.toISOString() ?? null, revokedAt: selection.revokedAt?.toISOString() ?? null })) };
  });

  app.post<{ Params: { dealId: string }; Body: { propertyExternalIds: string[] } }>("/deals/:dealId/via-selections", {
    schema: { params: dealParams, body: { type: "object", additionalProperties: false, required: ["propertyExternalIds"], properties: { propertyExternalIds: { type: "array", minItems: 1, maxItems: 10, uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 120 } } } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const deal = await database.client.deal.findFirst({ where: { id: request.params.dealId, ...dealScope(user) }, select: { id: true, contactId: true } });
    if (!deal) return reply.status(404).send({ error: "deal_not_found", message: "Сделка не найдена." });
    const client = await clientFor(user.organization.id);
    if (!client) return reply.status(409).send({ error: "via_disabled", message: "Интеграция Via не подключена или выключена." });
    const id = randomUUID();
    const contextId = randomUUID();
    const propertyExternalIds = request.body.propertyExternalIds;
    let createdViaSelectionId: string | null = null;
    try {
      const result = await client.request<ViaSelectionReply>("POST", "/api/integrations/estate/v1/selections", { externalSelectionId: id, crmContextId: contextId, propertyExternalIds, expiresAt: null }, id);
      if (!result || typeof result.selectionId !== "string" || typeof result.shareUrl !== "string" || !Array.isArray(result.acceptedPropertyExternalIds) || !Array.isArray(result.unavailablePropertyExternalIds)) return reply.status(502).send({ error: "invalid_via_selection", message: "Via вернул некорректную подборку." });
      createdViaSelectionId = result.selectionId;
      if (result.unavailablePropertyExternalIds.length || propertyExternalIds.some((item) => !result.acceptedPropertyExternalIds.includes(item))) {
        await client.request("POST", `/api/integrations/estate/v1/selections/${encodeURIComponent(result.selectionId)}/revoke`).catch(() => undefined);
        return reply.status(409).send({ error: "via_properties_unavailable", message: "Некоторые объекты Via недоступны. Обновите каталог и создайте подборку заново." });
      }
      const shareUrl = new URL(result.shareUrl);
      if (shareUrl.protocol !== "https:" && !(shareUrl.protocol === "http:" && shareUrl.hostname === "localhost")) {
        await client.request("POST", `/api/integrations/estate/v1/selections/${encodeURIComponent(result.selectionId)}/revoke`).catch(() => undefined);
        return reply.status(502).send({ error: "invalid_via_url", message: "Via вернул небезопасную ссылку." });
      }
      const selection = await database.client.$transaction(async (tx) => {
        const created = await tx.viaSharedSelection.create({ data: { id, organizationId: user.organization.id, dealId: deal.id, contactId: deal.contactId, contextId, viaSelectionId: result.selectionId, shareUrl: shareUrl.toString(), propertyExternalIds, status: "CREATED", createdById: user.id } });
        await tx.activityEvent.create({ data: { organizationId: user.organization.id, dealId: deal.id, contactId: deal.contactId, authorId: user.id, category: "OBJECT", title: "Ссылка на подборку Via создана", description: `${propertyExternalIds.length} объектов` } });
        return created;
      });
      createdViaSelectionId = null;
      return reply.status(201).send({ selection: { ...selection, propertyExternalIds, createdAt: selection.createdAt.toISOString(), sentAt: null, revokedAt: null } });
    } catch (error) {
      if (createdViaSelectionId) await client.request("POST", `/api/integrations/estate/v1/selections/${encodeURIComponent(createdViaSelectionId)}/revoke`).catch(() => undefined);
      return reply.status(502).send({ error: "via_unavailable", message: errorMessage(error) });
    }
  });

  app.post<{ Params: { dealId: string; selectionId: string } }>("/deals/:dealId/via-selections/:selectionId/sent", { schema: { params: shareParams } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const share = await database.client.viaSharedSelection.findFirst({ where: { id: request.params.selectionId, dealId: request.params.dealId, organizationId: user.organization.id, deal: dealScope(user) } });
    if (!share) return reply.status(404).send({ error: "via_selection_not_found", message: "Подборка Via не найдена." });
    if (share.status === "REVOKED") return reply.status(409).send({ error: "via_selection_revoked", message: "Эта ссылка уже отозвана." });
    const selection = share.status === "SENT" ? share : await database.client.viaSharedSelection.update({ where: { id: share.id }, data: { status: "SENT", sentAt: new Date() } });
    if (share.status !== "SENT") await database.client.activityEvent.create({ data: { organizationId: user.organization.id, dealId: share.dealId, contactId: share.contactId, authorId: user.id, category: "OBJECT", title: "Подборка Via предложена клиенту", description: `${(share.propertyExternalIds as string[]).length} объектов` } });
    return { selection: { ...selection, propertyExternalIds: selection.propertyExternalIds as string[], createdAt: selection.createdAt.toISOString(), sentAt: selection.sentAt?.toISOString() ?? null, revokedAt: selection.revokedAt?.toISOString() ?? null } };
  });

  app.post<{ Params: { dealId: string; selectionId: string } }>("/deals/:dealId/via-selections/:selectionId/revoke", { schema: { params: shareParams } }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const share = await database.client.viaSharedSelection.findFirst({ where: { id: request.params.selectionId, dealId: request.params.dealId, organizationId: user.organization.id, deal: dealScope(user) } });
    if (!share) return reply.status(404).send({ error: "via_selection_not_found", message: "Подборка Via не найдена." });
    if (share.status === "REVOKED") return { selection: { ...share, propertyExternalIds: share.propertyExternalIds as string[], createdAt: share.createdAt.toISOString(), sentAt: share.sentAt?.toISOString() ?? null, revokedAt: share.revokedAt?.toISOString() ?? null } };
    const client = await clientFor(user.organization.id);
    if (!client) return reply.status(409).send({ error: "via_disabled", message: "Включите Via, чтобы отозвать ссылку на его стороне." });
    try { await client.request("POST", `/api/integrations/estate/v1/selections/${encodeURIComponent(share.viaSelectionId)}/revoke`, undefined, share.id); }
    catch (error) { return reply.status(502).send({ error: "via_unavailable", message: errorMessage(error) }); }
    const selection = await database.client.viaSharedSelection.update({ where: { id: share.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    await database.client.activityEvent.create({ data: { organizationId: user.organization.id, dealId: share.dealId, contactId: share.contactId, authorId: user.id, category: "OBJECT", title: "Ссылка на подборку Via отозвана" } });
    return { selection: { ...selection, propertyExternalIds: selection.propertyExternalIds as string[], createdAt: selection.createdAt.toISOString(), sentAt: selection.sentAt?.toISOString() ?? null, revokedAt: selection.revokedAt?.toISOString() ?? null } };
  });

  await app.register(async (signedRoutes) => {
    signedRoutes.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => done(null, body));
    signedRoutes.post<{ Body: string; Reply: { ok: true; duplicate: boolean } | ApiErrorResponse }>("/integrations/via/events", { bodyLimit: 64_000 }, async (request, reply) => {
      const rawBody = request.body;
      if (typeof rawBody !== "string") return reply.status(400).send({ error: "invalid_event", message: "Некорректное событие Via." });
      let parsed: unknown;
      try { parsed = JSON.parse(rawBody); } catch { return reply.status(400).send({ error: "invalid_event", message: "Некорректное событие Via." }); }
      const event = parseViaEvent(parsed);
      if (!event) return reply.status(400).send({ error: "invalid_event", message: "Некорректное событие Via." });
      const connection = await database.client.integrationConnection.findUnique({ where: { id: event.connectionId } });
      if (!connection || connection.provider !== "VIA" || connection.status !== "CONNECTED" || !connection.enabled || !connection.credentialCiphertext || !key) return reply.status(401).send({ error: "via_not_connected", message: "Связь Via неактивна." });
      const configData = connection.config && typeof connection.config === "object" && !Array.isArray(connection.config) ? connection.config as { viaTenant?: string } : null;
      if (configData?.viaTenant !== event.viaTenant) return reply.status(401).send({ error: "via_wrong_tenant", message: "Организация Via не совпадает." });
      const headerConnection = request.headers["x-integration-connection"];
      const timestamp = request.headers["x-integration-timestamp"];
      const signature = request.headers["x-integration-signature"];
      if (headerConnection !== connection.id || typeof timestamp !== "string" || typeof signature !== "string" || !verifyViaRequestSignature({ secret: decryptViaCredential(connection.credentialCiphertext, key), timestamp, connectionId: connection.id, method: "POST", path: request.url, body: rawBody, signature })) return reply.status(401).send({ error: "invalid_via_signature", message: "Подпись Via недействительна." });
      const existing = await database.client.integrationEvent.findUnique({ where: { organizationId_provider_externalId: { organizationId: connection.organizationId, provider: "VIA", externalId: event.eventId } } });
      if (existing) return { ok: true, duplicate: true };
      const share = event.crmContextId ? await database.client.viaSharedSelection.findUnique({ where: { contextId: event.crmContextId } }) : null;
      if (share && (share.organizationId !== connection.organizationId || (event.selectionId && share.viaSelectionId !== event.selectionId) || (event.externalSelectionId && share.id !== event.externalSelectionId))) return reply.status(401).send({ error: "invalid_via_context", message: "Событие Via не принадлежит этой подборке." });
      if (event.crmContextId && !share) return reply.status(404).send({ error: "via_context_not_found", message: "Подборка CRM не найдена." });
      try {
        await database.client.$transaction(async (tx) => {
          const saved = await tx.integrationEvent.create({ data: { organizationId: connection.organizationId, connectionId: connection.id, provider: "VIA", externalId: event.eventId, eventType: event.type, payload: event, status: "PROCESSED", contactId: share?.contactId ?? null, dealId: share?.dealId ?? null, processedAt: new Date() } });
          if (share) await tx.activityEvent.create({ data: { organizationId: connection.organizationId, dealId: share.dealId, contactId: share.contactId, category: "OBJECT", title: eventTitles[event.type], description: eventDescription(event) } });
          await tx.integrationConnection.update({ where: { id: connection.id }, data: { lastEventAt: saved.receivedAt, lastError: null } });
        });
        return { ok: true, duplicate: false };
      } catch (error) {
        const duplicate = await database.client.integrationEvent.findUnique({ where: { organizationId_provider_externalId: { organizationId: connection.organizationId, provider: "VIA", externalId: event.eventId } } });
        if (duplicate) return { ok: true, duplicate: true };
        request.log.error({ error }, "Via event could not be stored");
        return reply.status(500).send({ error: "via_event_failed", message: "Событие Via не удалось сохранить." });
      }
    });
  });
}
