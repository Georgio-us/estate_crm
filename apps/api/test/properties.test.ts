import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const sessionUser = { id: "user-1", email: "admin@example.com", name: "Администратор", memberships: [{ role: "ADMIN" as const, organization: { id: "org-1", name: "CRM Del Mar", slug: "crm-delmar" } }] };
const now = new Date("2026-09-08T12:00:00.000Z");
const baseProperty = { id: "1b5f11c6-63f4-4d2e-8238-4402f176e728", number: 2301, title: "Квартира у моря", address: null, district: "Приморский", category: "APARTMENT" as const, market: "SECONDARY" as const, operation: "SALE" as const, status: "AVAILABLE" as const, price: 120000, currency: "USD" as const, rooms: "2", area: 70, floor: null, totalFloors: null, landArea: null, project: null, developer: null, description: null, imageUrl: null, createdAt: now, updatedAt: now };

function session() { return { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser }; } }; }

test("creating a property persists it in the authenticated organization", async () => {
  let createdData: Record<string, unknown> = {};
  const database = { client: { session: session(), property: { async create({ data }: { data: Record<string, unknown> }) { createdData = data; return { ...baseProperty, ...data }; } } }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: "/properties", headers: { cookie: "estate_crm_session=test-token" }, payload: { title: "  Квартира у моря  ", category: "APARTMENT", market: "SECONDARY", price: 120000, district: "Приморский" } });
  assert.equal(response.statusCode, 201);
  assert.equal(createdData.organizationId, "org-1");
  assert.equal(createdData.title, "Квартира у моря");
  assert.equal(response.json().property.code, "OD-2301");
  await app.close();
});

test("updating a property is scoped to its organization and persists status", async () => {
  let updatedData: Record<string, unknown> = {};
  const database = { client: { session: session(), property: { async findFirst({ where }: { where: Record<string, unknown> }) { assert.equal(where.organizationId, "org-1"); return { id: baseProperty.id }; }, async update({ data }: { data: Record<string, unknown> }) { updatedData = data; return { ...baseProperty, ...data }; } } }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "PATCH", url: `/properties/${baseProperty.id}`, headers: { cookie: "estate_crm_session=test-token" }, payload: { status: "RESERVED", price: 125000 } });
  assert.equal(response.statusCode, 200);
  assert.equal(updatedData.status, "RESERVED");
  assert.equal(response.json().property.price, 125000);
  await app.close();
});
