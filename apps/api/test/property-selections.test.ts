import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const organizationId = "28f400f2-7130-420f-b88c-d0cf5107b864";
const userId = "3b9ae340-7445-4a14-8b1d-d030c882c775";
const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
const contactId = "201f180c-d032-49a0-8aa7-04db19095eb2";
const propertyId = "1b5f11c6-63f4-4d2e-8238-4402f176e728";
const selectionId = "b7ae394d-528d-4f83-b88a-43bb596e07bf";
const now = new Date("2026-09-12T12:00:00.000Z");
const sessionUser = { id: userId, email: "admin@example.com", name: "Администратор", memberships: [{ role: "ADMIN" as const, organization: { id: organizationId, name: "Estate CRM", slug: "estate-crm" } }] };

test("a deal property selection can be added, marked as offered and removed", async () => {
  let selection = {
    id: selectionId, organizationId, dealId, propertyId, catalogKey: `property:${propertyId}`,
    status: "CANDIDATE" as "CANDIDATE" | "OFFERED", title: "Квартира у моря", subtitle: "Приморский район",
    priceLabel: "$120 000", imageUrl: null, createdAt: now, updatedAt: now,
  };
  const activityTitles: string[] = [];
  const database = {
    client: {
      session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser }; } },
      deal: { async findFirst() { return { id: dealId, contactId }; } },
      property: { async findFirst({ where }: { where: Record<string, unknown> }) { assert.equal(where.organizationId, organizationId); return { id: propertyId }; } },
      dealPropertySelection: {
        async findMany() { return [selection]; },
        async findFirst() { return { ...selection, deal: { contactId } }; },
        async upsert() { return selection; },
        async update({ data }: { data: { status: "CANDIDATE" | "OFFERED" } }) { selection = { ...selection, status: data.status }; return selection; },
        async delete() { return selection; },
      },
      activityEvent: { async create({ data }: { data: { title: string } }) { activityTitles.push(data.title); return { id: crypto.randomUUID(), ...data, createdAt: now }; } },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const headers = { cookie: "estate_crm_session=test-token" };
  const created = await app.inject({ method: "POST", url: `/deals/${dealId}/property-selections`, headers, payload: { propertyId, catalogKey: selection.catalogKey, title: selection.title, subtitle: selection.subtitle, priceLabel: selection.priceLabel } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().selection.status, "CANDIDATE");

  const offered = await app.inject({ method: "PATCH", url: `/deals/${dealId}/property-selections/${selectionId}`, headers, payload: { status: "OFFERED" } });
  assert.equal(offered.statusCode, 200);
  assert.equal(offered.json().selection.status, "OFFERED");

  const listed = await app.inject({ method: "GET", url: `/deals/${dealId}/property-selections`, headers });
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.json().selections[0].title, "Квартира у моря");

  const removed = await app.inject({ method: "DELETE", url: `/deals/${dealId}/property-selections/${selectionId}`, headers });
  assert.equal(removed.statusCode, 200);
  assert.deepEqual(activityTitles, ["Объект добавлен в подборку", "Объект предложен клиенту", "Объект удалён из подборки"]);
  await app.close();
});
