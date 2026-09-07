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

const user = {
  id: "3b9ae340-7445-4a14-8b1d-d030c882c775",
  email: "admin@example.com",
  name: "Администратор",
  memberships: [{
    role: "ADMIN" as const,
    organization: { id: "28f400f2-7130-420f-b88c-d0cf5107b864", name: "CRM Del Mar", slug: "crm-delmar" },
  }],
};

const pipelineId = "f37ec840-3aec-4a86-9899-49256404382c";
const stageId = "0241b821-d062-4669-a919-b744901568e9";
const contactId = "201f180c-d032-49a0-8aa7-04db19095eb2";

function session() {
  return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user };
}

test("pipeline is loaded for the authenticated organization", async () => {
  let requestedOrganization = "";
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      pipeline: {
        async findFirst({ where }: { where: { organizationId: string } }) {
          requestedOrganization = where.organizationId;
          return { id: pipelineId, name: "Продажа недвижимости", createdAt: new Date() };
        },
      },
      pipelineStage: {
        async findMany() {
          return [{ id: stageId, title: "Новый лид", color: "#d98245", position: 0, deals: [] }];
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({ method: "GET", url: "/pipeline", headers: { cookie: "estate_crm_session=test-token" } });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedOrganization, user.memberships[0].organization.id);
  assert.equal(response.json().pipeline.stages[0].title, "Новый лид");
  await app.close();
});

test("deal creation links an existing contact inside the current organization", async () => {
  let createdData: Record<string, unknown> = {};
  const now = new Date("2026-09-07T18:00:00.000Z");
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      pipelineStage: {
        async findFirst() { return { id: stageId, pipelineId, pipeline: { id: pipelineId, organizationId: user.memberships[0].organization.id } }; },
      },
      contact: {
        async findFirst() { return { id: contactId, name: "Тестовый контакт", phone: "+380938849214" }; },
      },
      deal: {
        async create({ data }: { data: Record<string, unknown> }) {
          createdData = data;
          return {
            id: "14a292bd-d84e-447c-b71a-aa185b809b88",
            number: 1001,
            ...data,
            budget: null,
            propertyType: null,
            district: null,
            rooms: null,
            position: 0,
            createdAt: now,
            updatedAt: now,
            contact: { id: contactId, name: "Тестовый контакт", phone: "+380938849214" },
            assignee: null,
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
    url: "/deals",
    headers: { cookie: "estate_crm_session=test-token" },
    payload: { stageId, contactId, request: "Квартира у моря" },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(createdData.organizationId, user.memberships[0].organization.id);
  assert.equal(createdData.contactId, contactId);
  assert.equal(response.json().deal.number, 1001);
  await app.close();
});
