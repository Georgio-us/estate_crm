import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";
import { encryptViaCredential, signViaRequest } from "../src/integrations/via/security.js";

test("Via event route verifies the raw JSON body before accepting an event", async () => {
  const key = randomBytes(32);
  const secret = "shared-credential";
  const connectionId = randomUUID();
  const eventId = randomUUID();
  const organizationId = randomUUID();
  const dealId = randomUUID();
  const contactId = randomUUID();
  const externalSelectionId = randomUUID();
  const crmContextId = randomUUID();
  const selectionId = randomUUID();
  const connection = { id: connectionId, organizationId, provider: "VIA", status: "CONNECTED", enabled: true, credentialCiphertext: encryptViaCredential(secret, key), config: { viaTenant: "delmar" } };
  const savedEvents = new Set<string>();
  const stored: Array<{ payload: unknown; dealId: string | null; contactId: string | null }> = [];
  const activities: Array<{ dealId: string; contactId: string | null; title: string }> = [];
  const database = { client: {
    integrationConnection: { async findUnique() { return connection; }, async update() {} },
    integrationEvent: { async findUnique(args: { where: { organizationId_provider_externalId: { externalId: string } } }) { return savedEvents.has(args.where.organizationId_provider_externalId.externalId) ? { id: eventId } : null; }, async create(args: { data: { externalId: string; payload: unknown; dealId: string | null; contactId: string | null } }) { savedEvents.add(args.data.externalId); stored.push(args.data); return { receivedAt: new Date() }; } },
    viaSharedSelection: { async findUnique() { return { id: externalSelectionId, contextId: crmContextId, organizationId, viaSelectionId: selectionId, dealId, contactId }; } },
    activityEvent: { async create(args: { data: { dealId: string; contactId: string | null; title: string } }) { activities.push(args.data); } },
    async $transaction(callback: (client: unknown) => Promise<unknown>) { return callback(this); },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp({ host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused", sessionDays: 30, secureCookies: false, viaApiBaseUrl: "https://via.example.com", viaTenant: "delmar", viaEncryptionKey: key.toString("base64url"), publicApiUrl: "https://crm.example.com" }, database);
  const body = JSON.stringify({ eventId, connectionId, type: "mini_app_lead.created", occurredAt: new Date().toISOString(), viaTenant: "delmar", selectionId, externalSelectionId, crmContextId,
    telegram: { userId: "123456789", username: "client_username" }, propertyExternalId: "A001",
    lead: { viaLeadId: "123", source: "tg_property_card", name: "Client Name", phone: "+380 501234567", email: "client@example.com", comment: "Интересуется объектом" } });
  const timestamp = String(Date.now());
  const headers = { "content-type": "application/json", "x-integration-connection": connectionId, "x-integration-timestamp": timestamp, "x-integration-signature": signViaRequest(secret, timestamp, connectionId, "POST", "/integrations/via/events", body) };
  const good = await app.inject({ method: "POST", url: "/integrations/via/events", headers, payload: body });
  assert.equal(good.statusCode, 200, good.body);
  assert.deepEqual(good.json(), { ok: true, duplicate: false });
  assert.equal(stored[0]?.dealId, dealId);
  assert.equal(stored[0]?.contactId, contactId);
  assert.equal((stored[0]?.payload as { lead?: { viaLeadId?: string } })?.lead?.viaLeadId, "123");
  assert.equal(activities[0]?.title, "Клиент оставил заявку в Via");
  const repeated = await app.inject({ method: "POST", url: "/integrations/via/events", headers, payload: body });
  assert.equal(repeated.statusCode, 200, repeated.body);
  assert.deepEqual(repeated.json(), { ok: true, duplicate: true });
  assert.equal(activities.length, 1);
  const bad = await app.inject({ method: "POST", url: "/integrations/via/events", headers: { ...headers, "x-integration-signature": "bad" }, payload: body });
  assert.equal(bad.statusCode, 401, bad.body);
  const wrongTenantBody = JSON.stringify({ eventId: randomUUID(), connectionId, type: "selection.opened", occurredAt: new Date().toISOString(), viaTenant: "other" });
  const wrongTenant = await app.inject({ method: "POST", url: "/integrations/via/events", headers: { ...headers, "x-integration-signature": signViaRequest(secret, timestamp, connectionId, "POST", "/integrations/via/events", wrongTenantBody) }, payload: wrongTenantBody });
  assert.equal(wrongTenant.statusCode, 401, wrongTenant.body);
  await app.close();
});

test("only CRM ADMIN can issue Via pairing code and server claim returns a credential once", async () => {
  const key = randomBytes(32);
  const organizationId = randomUUID();
  const connectionId = randomUUID();
  let pairing: { id: string; organizationId: string; codeHash: string; viaTenant: string; expiresAt: Date; claimedAt: Date | null } | null = null;
  let role: "ADMIN" | "LEAD" = "LEAD";
  const user = { id: randomUUID(), email: "operator@example.com", name: "Оператор", memberships: [{ role, organization: { id: organizationId, name: "Delmar", slug: "delmar" } }] };
  const tx = {
    viaPairing: { async updateMany() { if (pairing) pairing.claimedAt = new Date(); return { count: pairing ? 1 : 0 }; } },
    integrationConnection: { async upsert() { return { id: connectionId }; } },
  };
  const database = { client: {
    session: { async findUnique() { user.memberships[0].role = role; return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user }; } },
    viaPairing: {
      async updateMany() { return { count: 0 }; },
      async create(args: { data: { organizationId: string; codeHash: string; viaTenant: string; expiresAt: Date } }) { pairing = { id: randomUUID(), ...args.data, claimedAt: null }; return pairing; },
      async findUnique() { return pairing; },
    },
    integrationConnection: { async findUnique() { return null; } },
    async $transaction(callback: (value: typeof tx) => Promise<unknown>) { return callback(tx); },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp({ host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused", sessionDays: 30, secureCookies: false, viaApiBaseUrl: "https://via.example.com", viaTenant: "delmar", viaEncryptionKey: key.toString("base64url"), publicApiUrl: "https://crm.example.com" }, database);
  const cookie = { cookie: "estate_crm_session=test-token" };
  const forbidden = await app.inject({ method: "POST", url: "/integrations/via/pairing/issue", headers: cookie });
  assert.equal(forbidden.statusCode, 403, forbidden.body);
  role = "ADMIN";
  const issued = await app.inject({ method: "POST", url: "/integrations/via/pairing/issue", headers: cookie });
  assert.equal(issued.statusCode, 200, issued.body);
  const code = issued.json().pairingCode as string;
  assert.equal(code.length >= 30, true);
  const claimed = await app.inject({ method: "POST", url: "/integrations/via/pairing/claim", payload: { pairingCode: code, viaTenant: "delmar" } });
  assert.equal(claimed.statusCode, 200, claimed.body);
  assert.equal(claimed.json().connectionId, connectionId);
  assert.equal(claimed.json().sharedCredential.length >= 40, true);
  assert.equal(claimed.json().eventEndpoint, "https://crm.example.com/integrations/via/events");
  const repeated = await app.inject({ method: "POST", url: "/integrations/via/pairing/claim", payload: { pairingCode: code, viaTenant: "delmar" } });
  assert.equal(repeated.statusCode, 401, repeated.body);
  await app.close();
});

test("CRM creates a Via selection from a scoped deal and records it without copying properties", async () => {
  const key = randomBytes(32);
  const secret = "shared-credential";
  const organizationId = randomUUID();
  const dealId = randomUUID();
  const contactId = randomUUID();
  const userId = randomUUID();
  const connection = { id: randomUUID(), organizationId, provider: "VIA", status: "CONNECTED", enabled: true, credentialCiphertext: encryptViaCredential(secret, key), config: { viaTenant: "delmar" } };
  const user = { id: userId, email: "manager@example.com", name: "Менеджер", memberships: [{ role: "ADMIN", organization: { id: organizationId, name: "Delmar", slug: "delmar" } }] };
  const selections: Array<Record<string, unknown>> = [];
  const activity: Array<Record<string, unknown>> = [];
  let importedProperty: { id: string; sourceHash: string; data: Record<string, unknown> } | null = null;
  const database = { client: {
    session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user }; } },
    integrationConnection: { async findUnique() { return connection; } },
    deal: { async findFirst() { return { id: dealId, contactId }; } },
    viaSharedSelection: {
      async create(args: { data: Record<string, unknown> }) { const selection = { ...args.data, createdAt: new Date(), sentAt: null, revokedAt: null }; selections.push(selection); return selection; },
      async findMany() { return selections; },
    },
    property: {
      async findFirst(args: { where: { sourceHash?: string } }) { return importedProperty?.sourceHash === args.where.sourceHash ? { id: importedProperty.id } : null; },
      async create(args: { data: Record<string, unknown> }) { importedProperty = { id: randomUUID(), sourceHash: String(args.data.sourceHash), data: args.data }; return importedProperty; },
    },
    activityEvent: { async create(args: { data: Record<string, unknown> }) { activity.push(args.data); } },
    async $transaction(callback: (client: unknown) => Promise<unknown>) { return callback(this); },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const originalFetch = globalThis.fetch;
  const remoteCalls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    remoteCalls.push(url.pathname);
    assert.equal(url.origin, "https://via.example.com");
    assert.equal(init?.headers && (init.headers as Record<string, string>)["x-integration-connection"], connection.id);
    if (url.pathname.endsWith("/properties")) return Response.json({ items: [{ externalId: "via-101", title: "Квартира у моря", active: true, operation: "sale", propertyType: "apartment", price: 125000, currency: "EUR", rooms: "2", areaM2: 67, district: "Приморский", previewImageUrl: "https://via.example.com/property.jpg" }], nextCursor: null });
    if (url.pathname.endsWith("/selections")) return Response.json({ selectionId: "via-share-101", shareUrl: "https://via.example.com/s/abc", acceptedPropertyExternalIds: ["via-101"], unavailablePropertyExternalIds: [] });
    return Response.json({ error: "unexpected" }, { status: 404 });
  };
  const app = await buildApp({ host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused", sessionDays: 30, secureCookies: false, viaApiBaseUrl: "https://via.example.com", viaTenant: "delmar", viaEncryptionKey: key.toString("base64url"), publicApiUrl: "https://crm.example.com" }, database);
  try {
    const headers = { cookie: "estate_crm_session=test-token" };
    const catalog = await app.inject({ method: "GET", url: "/integrations/via/properties", headers });
    assert.equal(catalog.statusCode, 200, catalog.body);
    assert.equal(catalog.json().items[0].externalId, "via-101");
    const created = await app.inject({ method: "POST", url: `/deals/${dealId}/via-selections`, headers, payload: { propertyExternalIds: ["via-101"] } });
    assert.equal(created.statusCode, 201, created.body);
    assert.equal(created.json().selection.shareUrl, "https://via.example.com/s/abc");
    assert.equal(selections.length, 1);
    assert.equal(activity.length, 1);
    assert.equal(importedProperty, null, "creating a selection must not silently copy Via properties");
    const imported = await app.inject({ method: "POST", url: "/integrations/via/properties/via-101/import", headers });
    assert.equal(imported.statusCode, 201, imported.body);
    assert.equal(imported.json().imported, true);
    assert.equal(importedProperty?.sourceHash, "via:via-101");
    assert.equal(importedProperty?.data.currency, "EUR");
    assert.equal(importedProperty?.data.market, "SECONDARY");
    const repeatedImport = await app.inject({ method: "POST", url: "/integrations/via/properties/via-101/import", headers });
    assert.equal(repeatedImport.statusCode, 200, repeatedImport.body);
    assert.equal(repeatedImport.json().imported, false);
    assert.deepEqual(remoteCalls, ["/api/integrations/estate/v1/properties", "/api/integrations/estate/v1/selections", "/api/integrations/estate/v1/properties"]);
  } finally { globalThis.fetch = originalFetch; await app.close(); }
});
