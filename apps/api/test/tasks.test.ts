import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const userId = "6f398049-0273-4c80-9d36-56dc65069437";
const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
const contactId = "201f180c-d032-49a0-8aa7-04db19095eb2";
const taskId = "3a93e90c-769d-4716-9b4c-9ab6fa153244";
const now = new Date("2026-09-08T12:00:00.000Z");
const sessionUser = { id: userId, email: "admin@example.com", name: "Администратор", memberships: [{ role: "ADMIN" as const, organization: { id: "org-1", name: "CRM Del Mar", slug: "crm-delmar" } }] };

function taskRecord(overrides: Record<string, unknown> = {}) {
  return { id: taskId, title: "Позвонить клиенту", kind: "CALL" as const, status: "ACTIVE" as const, dueDate: new Date("2026-09-09T00:00:00.000Z"), dueTime: "10:30", result: null, completedAt: null, contact: { id: contactId, name: "Мария" }, deal: { id: dealId, number: 1001, title: "Квартира у моря" }, assignee: { id: userId, name: "Администратор" }, createdAt: now, updatedAt: now, ...overrides };
}

test("creating a task links it to the deal contact and writes deal history", async () => {
  let createdData: Record<string, unknown> = {};
  let activityData: Record<string, unknown> = {};
  const database = { client: {
    session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser }; } },
    deal: { async findFirst() { return { id: dealId, contactId, relatedContacts: [] }; } },
    task: { async create({ data }: { data: Record<string, unknown> }) { createdData = data; return taskRecord(); } },
    activityEvent: { async create({ data }: { data: Record<string, unknown> }) { activityData = data; } },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: "/tasks", headers: { cookie: "estate_crm_session=test-token" }, payload: { title: "Позвонить клиенту", kind: "CALL", dueDate: "2026-09-09", dueTime: "10:30", dealId } });

  assert.equal(response.statusCode, 201);
  assert.equal(createdData.contactId, contactId);
  assert.equal(createdData.dealId, dealId);
  assert.equal(activityData.dealId, dealId);
  assert.equal(activityData.category, "TASK");
  assert.equal(response.json().task.dueDate, "2026-09-09");
  await app.close();
});

test("completing a task persists the result and writes history", async () => {
  let updatedData: Record<string, unknown> = {};
  const database = { client: {
    session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser }; } },
    task: {
      async findFirst() { return taskRecord(); },
      async update({ data }: { data: Record<string, unknown> }) { updatedData = data; return taskRecord({ status: "COMPLETED" as const, result: data.result, completedAt: now }); },
    },
    activityEvent: { async create() {} },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: `/tasks/${taskId}/complete`, headers: { cookie: "estate_crm_session=test-token" }, payload: { result: "Договорились о встрече" } });

  assert.equal(response.statusCode, 200);
  assert.equal(updatedData.status, "COMPLETED");
  assert.equal(updatedData.result, "Договорились о встрече");
  assert.equal(response.json().task.status, "COMPLETED");
  await app.close();
});
