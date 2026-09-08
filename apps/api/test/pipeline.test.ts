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

test("pipeline configuration saves stage names, colors and order", async () => {
  const secondStageId = "1241b821-d062-4669-a919-b744901568e9";
  const createdStageId = "2241b821-d062-4669-a919-b744901568e9";
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  let findCalls = 0;
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      pipeline: { async findFirst() { return { id: pipelineId, name: "Продажа недвижимости", createdAt: new Date() }; } },
      pipelineStage: {
        async findMany() {
          findCalls += 1;
          if (findCalls === 1) return [
            { id: stageId, title: "Неразобранные", color: "#d6a835", position: 0, _count: { deals: 0 } },
            { id: secondStageId, title: "Новый лид", color: "#d98245", position: 1, _count: { deals: 0 } },
          ];
          return [
            { id: secondStageId, title: "Первичный контакт", color: "#5d8fc9", position: 0, _count: { deals: 0 } },
            { id: createdStageId, title: "Переговоры", color: "#4a9d75", position: 1, _count: { deals: 0 } },
          ];
        },
      },
      async $transaction(callback: (transaction: unknown) => Promise<void>) {
        await callback({
          pipelineStage: {
            async updateMany() {},
            async deleteMany() {},
            async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) { updates.push({ id: where.id, data }); },
            async create() { return { id: createdStageId }; },
          },
        });
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({
    method: "PUT",
    url: "/pipeline/configuration",
    headers: { cookie: "estate_crm_session=test-token" },
    payload: {
      stages: [
        { id: secondStageId, title: "Первичный контакт", color: "#5d8fc9" },
        { title: "Переговоры", color: "#4a9d75" },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().pipeline.stages.map((stage: { title: string }) => stage.title), ["Первичный контакт", "Переговоры"]);
  assert.equal(updates.at(-2)?.data.position, 0);
  assert.equal(updates.at(-1)?.data.position, 1);
  await app.close();
});

test("pipeline configuration protects a populated stage from deletion", async () => {
  const populatedStageId = "1241b821-d062-4669-a919-b744901568e9";
  let transactions = 0;
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      pipeline: { async findFirst() { return { id: pipelineId, name: "Продажа недвижимости", createdAt: new Date() }; } },
      pipelineStage: {
        async findMany() {
          return [
            { id: stageId, title: "Неразобранные", color: "#d6a835", position: 0, _count: { deals: 0 } },
            { id: populatedStageId, title: "В работе", color: "#8b6cc2", position: 1, _count: { deals: 3 } },
          ];
        },
      },
      async $transaction() { transactions += 1; },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({
    method: "PUT",
    url: "/pipeline/configuration",
    headers: { cookie: "estate_crm_session=test-token" },
    payload: { stages: [{ id: stageId, title: "Неразобранные", color: "#d6a835" }] },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "stage_not_empty");
  assert.equal(transactions, 0);
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
        async findFirst() { return { id: contactId, name: "Тестовый контакт", phone: "+380938849214", source: "MANUAL" as const }; },
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
      activityEvent: { async create() {} },
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
  assert.equal(createdData.title, "Квартира у моря");
  assert.equal(response.json().deal.number, 1001);
  await app.close();
});

test("updating a deal title does not mutate the linked contact", async () => {
  const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
  let updatedData: Record<string, unknown> = {};
  let contactUpdates = 0;
  let activityDescription = "";
  const now = new Date("2026-09-07T18:00:00.000Z");
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      deal: {
        async findFirst() {
          return { id: dealId, pipelineId, stageId, contactId, organizationId: user.memberships[0].organization.id, title: "Квартира у моря", request: "Квартира у моря", budget: null, comment: null, operation: "PURCHASE" as const, propertyType: null, district: null, rooms: null, source: "MANUAL" as const, assigneeId: null, stage: { id: stageId, title: "Новый лид" } };
        },
        async update({ data }: { data: Record<string, unknown> }) {
          updatedData = data;
          return {
            id: dealId,
            number: 1001,
            title: data.title,
            request: "Квартира у моря",
            budget: null,
            comment: null,
            operation: "PURCHASE" as const,
            propertyType: null,
            district: null,
            rooms: null,
            source: "MANUAL" as const,
            position: 0,
            stageId,
            createdAt: now,
            updatedAt: now,
            contact: { id: contactId, name: "Тестовый контакт", phone: "+380938849214" },
            assignee: null,
          };
        },
      },
      activityEvent: { async create({ data }: { data: { description: string } }) { activityDescription = data.description; } },
      contact: {
        async update() {
          contactUpdates += 1;
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({
    method: "PATCH",
    url: `/deals/${dealId}`,
    headers: { cookie: "estate_crm_session=test-token" },
    payload: { title: "Клиент не берёт трубку" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(updatedData.title, "Клиент не берёт трубку");
  assert.equal(response.json().deal.contact.name, "Тестовый контакт");
  assert.equal(contactUpdates, 0);
  assert.equal(activityDescription, "Название: «Квартира у моря» → «Клиент не берёт трубку»");
  await app.close();
});

test("deal creation does not silently reuse a phone from an existing contact", async () => {
  let dealCreates = 0;
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      pipelineStage: {
        async findFirst() { return { id: stageId, pipelineId, pipeline: { id: pipelineId, organizationId: user.memberships[0].organization.id } }; },
      },
      contact: {
        async findFirst() { return { id: contactId, name: "Тестовый контакт", phone: "+380938849214", source: "MANUAL" as const }; },
      },
      deal: {
        async create() { dealCreates += 1; },
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
    payload: { stageId, contactName: "Другое имя", phone: "+38 (093) 884-92-14" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "contact_already_exists");
  assert.equal(dealCreates, 0);
  await app.close();
});

test("changing a deal source synchronizes the contact and its other deals", async () => {
  const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
  let contactSource = "";
  let relatedDealsSource = "";
  const now = new Date("2026-09-07T18:00:00.000Z");
  const existing = {
    id: dealId, pipelineId, stageId, contactId, organizationId: user.memberships[0].organization.id,
    title: "Квартира у моря", request: "Квартира у моря", budget: null, comment: null,
    operation: "PURCHASE" as const, propertyType: null, district: null, rooms: null,
    source: "MANUAL" as const, assigneeId: null, stage: { id: stageId, title: "Новый лид" },
  };
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      deal: {
        async findFirst() { return existing; },
        async update({ data }: { data: Record<string, unknown> }) {
          return { ...existing, ...data, number: 1001, position: 0, createdAt: now, updatedAt: now, contact: { id: contactId, name: "Тестовый контакт", phone: "+380 93 884 92 14" }, assignee: null };
        },
        async updateMany({ data }: { data: { source: string } }) { relatedDealsSource = data.source; },
      },
      contact: { async update({ data }: { data: { source: string } }) { contactSource = data.source; } },
      activityEvent: { async create() {} },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({ method: "PATCH", url: `/deals/${dealId}`, headers: { cookie: "estate_crm_session=test-token" }, payload: { source: "META" } });

  assert.equal(response.statusCode, 200);
  assert.equal(contactSource, "META");
  assert.equal(relatedDealsSource, "META");
  await app.close();
});

test("a secondary contact can be linked to a deal and is returned by the API", async () => {
  const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
  const relatedContactId = "8de55dd9-a09d-4f6d-9f0b-5cfe2ff895d1";
  let createdLink: Record<string, unknown> = {};
  const now = new Date("2026-09-08T10:00:00.000Z");
  const relatedContact = { id: relatedContactId, name: "Ольга Войченко", phone: "+380 50 123 45 67" };
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      deal: {
        async findFirst() { return { id: dealId, stageId, contactId }; },
        async findUniqueOrThrow() {
          return { id: dealId, number: 1001, organizationId: user.memberships[0].organization.id, pipelineId, stageId, contactId, assigneeId: null, title: "Клиент тест", request: "", budget: null, comment: null, operation: "PURCHASE" as const, propertyType: null, district: null, rooms: null, source: "MANUAL" as const, position: 0, createdAt: now, updatedAt: now, contact: { id: contactId, name: "Игорь Войченко", phone: "+380 93 884 92 14" }, relatedContacts: [{ contact: relatedContact }], assignee: null };
        },
      },
      contact: { async findFirst() { return { id: relatedContactId, name: relatedContact.name }; } },
      dealRelatedContact: {
        async findUnique() { return null; },
        async create({ data }: { data: Record<string, unknown> }) { createdLink = data; },
      },
      activityEvent: { async create() {} },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: `/deals/${dealId}/contacts`, headers: { cookie: "estate_crm_session=test-token" }, payload: { contactId: relatedContactId } });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(createdLink, { dealId, contactId: relatedContactId });
  assert.equal(response.json().deal.relatedContacts[0].name, "Ольга Войченко");
  await app.close();
});

test("closing a deal persists its lifecycle without deleting the contact", async () => {
  const dealId = "14a292bd-d84e-447c-b71a-aa185b809b88";
  const now = new Date("2026-09-08T15:00:00.000Z");
  let updatedData: Record<string, unknown> = {};
  let activityTitle = "";
  const database = {
    client: {
      session: { async findUnique() { return session(); } },
      deal: {
        async findFirst() { return { id: dealId, contactId, stageId, status: "ACTIVE" as const, closedAt: null }; },
        async update({ data }: { data: Record<string, unknown> }) {
          updatedData = data;
          return { id: dealId, number: 1001, organizationId: user.memberships[0].organization.id, pipelineId, stageId, contactId, assigneeId: null, title: "Клиент тест", request: "", budget: null, comment: null, operation: "PURCHASE" as const, propertyType: null, district: null, rooms: null, source: "MANUAL" as const, status: data.status, position: 0, closedAt: data.closedAt, createdAt: now, updatedAt: now, contact: { id: contactId, name: "Игорь Войченко", phone: "+380 93 884 92 14" }, relatedContacts: [], tasks: [], assignee: null };
        },
      },
      activityEvent: { async create({ data }: { data: { title: string } }) { activityTitle = data.title; } },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({ method: "PATCH", url: `/deals/${dealId}/lifecycle`, headers: { cookie: "estate_crm_session=test-token" }, payload: { status: "WON" } });

  assert.equal(response.statusCode, 200);
  assert.equal(updatedData.status, "WON");
  assert.ok(updatedData.closedAt instanceof Date);
  assert.equal(response.json().deal.status, "WON");
  assert.equal(activityTitle, "Сделка успешно завершена");
  await app.close();
});
