import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = {
  host: "127.0.0.1",
  port: 3001,
  webOrigins: ["http://localhost:3000"],
  databaseUrl: "postgresql://unused-in-test",
  sessionDays: 30,
  secureCookies: false,
};

const organizationId = "28f400f2-7130-420f-b88c-d0cf5107b864";
const userId = "3b9ae340-7445-4a14-8b1d-d030c882c775";
const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
const contactId = "201f180c-d032-49a0-8aa7-04db19095eb2";
const sessionUser = {
  id: userId,
  email: "admin@example.com",
  name: "Администратор",
  memberships: [{ role: "ADMIN" as const, organization: { id: organizationId, name: "CRM Del Mar", slug: "crm-delmar" } }],
};

function session() {
  return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser };
}

test("a deal note is stored against both the deal and its contact", async () => {
  let createdData: Record<string, unknown> = {};
  const createdAt = new Date("2026-09-08T08:00:00.000Z");
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      deal: { async findFirst() { return { id: dealId, contactId }; } },
      activityEvent: {
        async create({ data }: { data: Record<string, unknown> }) {
          createdData = data;
          return {
            id: "b7ae394d-528d-4f83-b88a-43bb596e07bf",
            ...data,
            description: data.description as string,
            createdAt,
            author: { id: userId, name: "Администратор" },
          };
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({
    method: "POST",
    url: `/deals/${dealId}/notes`,
    headers: { cookie: "estate_crm_session=test-token" },
    payload: { text: "  Позвонить после 18:00  " },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(createdData.organizationId, organizationId);
  assert.equal(createdData.dealId, dealId);
  assert.equal(createdData.contactId, contactId);
  assert.equal(createdData.description, "Позвонить после 18:00");
  assert.equal(response.json().activity.author.name, "Администратор");
  await app.close();
});

test("contact history includes events from linked deals", async () => {
  let historyWhere: Record<string, unknown> = {};
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      contact: { async findFirst() { return { id: contactId }; } },
      activityEvent: {
        async findMany({ where }: { where: Record<string, unknown> }) {
          historyWhere = where;
          return [{
            id: "b7ae394d-528d-4f83-b88a-43bb596e07bf",
            contactId,
            dealId,
            category: "NOTE" as const,
            title: "Добавлено примечание",
            description: "Позвонить после 18:00",
            createdAt: new Date("2026-09-08T08:00:00.000Z"),
            author: { id: userId, name: "Администратор" },
          }];
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({
    method: "GET",
    url: `/contacts/${contactId}/activities`,
    headers: { cookie: "estate_crm_session=test-token" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(historyWhere.organizationId, organizationId);
  const historyGroups = historyWhere.AND as Array<{ OR: Array<Record<string, unknown>> }>;
  const historyBranches = historyGroups[0]!.OR;
  assert.equal(historyBranches[0].contactId, contactId);
  assert.deepEqual(historyBranches[1], { deal: { relatedContacts: { some: { contactId } } } });
  assert.equal(response.json().activities[0].dealId, dealId);
  await app.close();
});
