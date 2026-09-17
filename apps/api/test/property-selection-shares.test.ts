import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const organizationId = "28f400f2-7130-420f-b88c-d0cf5107b864";
const userId = "3b9ae340-7445-4a14-8b1d-d030c882c775";
const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
const contactId = "201f180c-d032-49a0-8aa7-04db19095eb2";
const selectionId = "1247bb3b-9c17-4437-8f58-1978a3d24763";
const shareId = "53a5229b-c907-45d5-a1d1-0a7e1e17ca08";
const createdAt = new Date("2026-09-17T12:00:00.000Z");

function session() {
  return { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: { id: userId, email: "admin@example.com", name: "Администратор", memberships: [{ role: "ADMIN" as const, organization: { id: organizationId, name: "CRM Del Mar", slug: "crm-delmar" } }] } }; } };
}

test("an authenticated manager creates a CRM-owned public selection snapshot", async () => {
  let createdShare: Record<string, unknown> = {};
  const selection = { id: selectionId, propertyId: "1b5f11c6-63f4-4d2e-8238-4402f176e728", catalogKey: "property:1b5f11c6-63f4-4d2e-8238-4402f176e728", title: "Квартира у моря", subtitle: "Приморский · 70 м²", priceLabel: "$120 000", imageUrl: null };
  const database = {
    client: {
      session: session(),
      deal: { async findFirst() { return { id: dealId, contactId }; } },
      dealPropertySelection: { async findMany() { return [selection]; } },
      propertySelectionShare: {
        async updateMany() { return { count: 0 }; },
        async create({ data }: { data: Record<string, unknown> }) {
          createdShare = data;
          const items = (data.items as { create: Array<Record<string, unknown>> }).create.map((item, index) => ({ id: `item-${index}`, ...item }));
          return { id: shareId, publicToken: data.publicToken, status: "CREATED", expiresAt: data.expiresAt, sentAt: null, openedAt: null, revokedAt: null, viewCount: 0, createdAt, items };
        },
      },
      activityEvent: { async create() { return {}; } },
    },
    async ping() {}, async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: `/deals/${dealId}/property-shares`, headers: { cookie: "estate_crm_session=test-token" }, payload: { selectionIds: [selectionId] } });
  assert.equal(response.statusCode, 201);
  assert.equal(createdShare.organizationId, organizationId);
  assert.match(response.json().share.publicPath, /^\/s\/[A-Za-z0-9_-]{43}$/);
  assert.equal(response.json().share.items[0].source, "CRM");
  await app.close();
});

test("the public endpoint returns only the presentation snapshot", async () => {
  const token = "A".repeat(43);
  const database = {
    client: {
      propertySelectionShare: {
        async findUnique() {
          return {
            id: shareId, publicToken: token, status: "SENT", expiresAt: new Date(Date.now() + 60_000),
            organization: { name: "CRM Del Mar", companyName: "Del Mar" }, contact: { name: "Юлия" }, createdBy: { name: "Менеджер" },
            items: [{ id: "item-1", title: "Квартира у моря", subtitle: "Приморский · 70 м²", priceLabel: "$120 000", imageUrl: null }],
          };
        },
      },
    },
    async ping() {}, async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({ method: "GET", url: `/public/property-shares/${token}` });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "AVAILABLE", organizationName: "Del Mar", clientName: "Юлия", managerName: "Менеджер",
    expiresAt: response.json().expiresAt,
    items: [{ id: "item-1", title: "Квартира у моря", subtitle: "Приморский · 70 м²", priceLabel: "$120 000", imageUrl: null }],
  });
  assert.equal("dealId" in response.json(), false);
  await app.close();
});
