import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const organizationId = "28f400f2-7130-420f-b88c-d0cf5107b864";
const user = { id: "3b9ae340-7445-4a14-8b1d-d030c882c775", email: "admin@example.com", name: "Администратор", memberships: [{ role: "ADMIN" as const, organization: { id: organizationId, name: "CRM Del Mar", slug: "crm-delmar" } }] };
const session = () => ({ id: "session-1", expiresAt: new Date(Date.now() + 60_000), user });

test("test gateway creates a contact, deal, audit event and notification atomically", async () => {
  const writes: string[] = [];
  const transaction = {
    integrationConnection: { async findUnique() { return null; }, async upsert() { writes.push("connection"); } },
    pipeline: { async findFirst() { return { id: "f37ec840-3aec-4a86-9899-49256404382c" }; } },
    pipelineStage: { async findFirst() { return { id: "0241b821-d062-4669-a919-b744901568e9" }; } },
    integrationEvent: {
      async create() { writes.push("event"); return { id: "34a292bd-d84e-447c-b71a-aa185b809b88" }; },
      async update() { writes.push("event-processed"); },
    },
    contact: {
      async findFirst() { return null; },
      async create() { writes.push("contact"); return { id: "201f180c-d032-49a0-8aa7-04db19095eb2", name: "Новый клиент" }; },
    },
    deal: {
      async findFirst() { return null; },
      async create() { writes.push("deal"); return { id: "14a292bd-d84e-447c-b71a-aa185b809b88", number: 1014 }; },
    },
    activityEvent: { async create() { writes.push("activity"); } },
    notificationOutbox: { async create() { writes.push("notification"); } },
  };
  const database = { client: {
    session: { async findUnique() { return session(); } },
    integrationEvent: { async findUnique() { return null; } },
    async $transaction(callback: (tx: typeof transaction) => Promise<unknown>) { return callback(transaction); },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: "/integrations/test-lead", headers: { cookie: "estate_crm_session=test-token" }, payload: { provider: "META_LEAD_ADS", name: "Новый клиент", phone: "063 123 45 67", message: "Нужна квартира" } });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().result.dealNumber, 1014);
  assert.equal(response.json().result.reusedContact, false);
  assert.deepEqual(writes, ["event", "contact", "deal", "activity", "notification", "event-processed", "connection"]);
  await app.close();
});

test("the same provider event is idempotent and does not start another transaction", async () => {
  let transactions = 0;
  const database = { client: {
    session: { async findUnique() { return session(); } },
    integrationEvent: { async findUnique() { return { id: "34a292bd-d84e-447c-b71a-aa185b809b88", contactId: "201f180c-d032-49a0-8aa7-04db19095eb2", dealId: "14a292bd-d84e-447c-b71a-aa185b809b88", deal: { number: 1014 } }; } },
    async $transaction() { transactions += 1; },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: "/integrations/test-lead", headers: { cookie: "estate_crm_session=test-token" }, payload: { provider: "META_LEAD_ADS", externalId: "lead-42", name: "Новый клиент", phone: "+380631234567" } });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().result.duplicate, true);
  assert.equal(response.json().result.notificationQueued, false);
  assert.equal(transactions, 0);
  await app.close();
});
