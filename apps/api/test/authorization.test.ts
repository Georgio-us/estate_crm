import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const managerId = "6f398049-0273-4c80-9d36-56dc65069437";
const organizationId = "28f400f2-7130-420f-b88c-d0cf5107b864";

function sessionUser(role: "ADMIN" | "LEAD" | "MANAGER") {
  return {
    id: managerId,
    email: "manager@example.com",
    name: "Менеджер",
    memberships: [{ role, organization: { id: organizationId, name: "CRM Del Mar", slug: "crm-delmar" } }],
  };
}

function session(role: "ADMIN" | "LEAD" | "MANAGER") {
  return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser(role) };
}

test("manager list queries include own records and the shared active unassigned queue", async () => {
  const captured: Record<string, unknown> = {};
  const database = {
    client: {
      session: { async findUnique() { return session("MANAGER"); } },
      pipeline: { async findFirst() { return { id: "pipeline-1", name: "Продажа", createdAt: new Date() }; } },
      pipelineStage: {
        async findMany({ include }: { include: { deals: { where: unknown } } }) {
          captured.deals = include.deals.where;
          return [{ id: "stage-1", title: "Новый лид", color: "#000000", position: 0, deals: [] }];
        },
      },
      contact: {
        async findMany({ where }: { where: unknown }) { captured.contacts = where; return []; },
      },
      task: {
        async findMany({ where }: { where: unknown }) { captured.tasks = where; return []; },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  for (const url of ["/pipeline", "/contacts", "/tasks"]) {
    const response = await app.inject({ method: "GET", url, headers: { cookie: "estate_crm_session=test-token" } });
    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(captured.deals, { status: "ACTIVE", organizationId, OR: [{ assigneeId: managerId }, { assigneeId: null, status: "ACTIVE" }] });
  assert.deepEqual(captured.contacts, {
    organizationId,
    status: "ACTIVE",
    OR: [
      { assigneeId: managerId },
      { deals: { some: { status: "ACTIVE", assigneeId: managerId } } },
      { deals: { some: { status: "ACTIVE", assigneeId: null } } },
    ],
  });
  assert.deepEqual(captured.tasks, { organizationId, assigneeId: managerId });
  await app.close();
});

test("manager direct-id queries keep organization and ownership or unassigned scopes", async () => {
  const scopes: Array<Record<string, unknown>> = [];
  const database = {
    client: {
      session: { async findUnique() { return session("MANAGER"); } },
      deal: { async findFirst({ where }: { where: Record<string, unknown> }) { scopes.push(where); return null; } },
      contact: { async findFirst({ where }: { where: Record<string, unknown> }) { scopes.push(where); return null; } },
      task: { async findFirst({ where }: { where: Record<string, unknown> }) { scopes.push(where); return null; } },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const requests = [
    { method: "PATCH", url: "/deals/14a292bd-d84e-447c-b71a-aa185b809b88", payload: { title: "Чужая сделка" } },
    { method: "PATCH", url: "/contacts/201f180c-d032-49a0-8aa7-04db19095eb2", payload: { name: "Чужой контакт" } },
    { method: "POST", url: "/tasks/3a93e90c-769d-4716-9b4c-9ab6fa153244/complete", payload: { result: "Обход" } },
  ];
  for (const item of requests) {
    const response = await app.inject({ ...item, headers: { cookie: "estate_crm_session=test-token" } });
    assert.equal(response.statusCode, 404);
  }
  assert.equal(scopes.length, 3);
  assert.deepEqual(scopes[0], { id: "14a292bd-d84e-447c-b71a-aa185b809b88", organizationId, OR: [{ assigneeId: managerId }, { assigneeId: null, status: "ACTIVE" }] });
  assert.deepEqual(scopes[1], {
    id: "201f180c-d032-49a0-8aa7-04db19095eb2",
    organizationId,
    OR: [
      { assigneeId: managerId },
      { deals: { some: { status: "ACTIVE", assigneeId: managerId } } },
      { deals: { some: { status: "ACTIVE", assigneeId: null } } },
    ],
  });
  assert.deepEqual(scopes[2], { id: "3a93e90c-769d-4716-9b4c-9ab6fa153244", organizationId, assigneeId: managerId });
  await app.close();
});

test("a contact created by a manager is always assigned to that manager", async () => {
  let createdData: Record<string, unknown> = {};
  const now = new Date("2026-09-09T09:00:00.000Z");
  const database = {
    client: {
      session: { async findUnique() { return session("MANAGER"); } },
      contact: {
        async findFirst() { return null; },
        async create({ data }: { data: Record<string, unknown> }) {
          createdData = data;
          return { id: "contact-1", ...data, source: "MANUAL" as const, createdAt: now, updatedAt: now, assignee: { id: managerId, name: "Менеджер" } };
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: "/contacts", headers: { cookie: "estate_crm_session=test-token" }, payload: { name: "Новый клиент", phone: "+380 93 123 45 67", assigneeId: null } });

  assert.equal(response.statusCode, 201);
  assert.equal(createdData.assigneeId, managerId);
  await app.close();
});

test("lead can see organization data but cannot change administrator settings", async () => {
  let contactsWhere: Record<string, unknown> = {};
  const database = {
    client: {
      session: { async findUnique() { return session("LEAD"); } },
      contact: { async findMany({ where }: { where: Record<string, unknown> }) { contactsWhere = where; return []; } },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const contacts = await app.inject({ method: "GET", url: "/contacts", headers: { cookie: "estate_crm_session=test-token" } });
  const settings = await app.inject({ method: "GET", url: "/pipeline/configuration", headers: { cookie: "estate_crm_session=test-token" } });

  assert.equal(contacts.statusCode, 200);
  assert.deepEqual(contactsWhere, { organizationId, status: "ACTIVE" });
  assert.equal(settings.statusCode, 403);
  await app.close();
});

test("assignee choices expose the active organization team to leaders and only self to managers", async () => {
  const captured: Array<Record<string, unknown>> = [];
  let role: "LEAD" | "MANAGER" = "LEAD";
  const database = {
    client: {
      session: { async findUnique() { return session(role); } },
      membership: {
        async findMany({ where }: { where: Record<string, unknown> }) {
          captured.push(where);
          return [{ role, user: { id: managerId, name: "Менеджер" } }];
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);

  const leadResponse = await app.inject({ method: "GET", url: "/team/assignees", headers: { cookie: "estate_crm_session=test-token" } });
  role = "MANAGER";
  const managerResponse = await app.inject({ method: "GET", url: "/team/assignees", headers: { cookie: "estate_crm_session=test-token" } });

  assert.equal(leadResponse.statusCode, 200);
  assert.deepEqual(captured[0], { organizationId, status: "ACTIVE" });
  assert.equal(managerResponse.statusCode, 200);
  assert.deepEqual(captured[1], { organizationId, status: "ACTIVE", userId: managerId });
  await app.close();
});
