import assert from "node:assert/strict";
import test from "node:test";
import cookiePlugin from "@fastify/cookie";
import Fastify from "fastify";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";
import { registerPilotRequestTracking } from "../src/pilot/routes.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const cookie = { cookie: "estate_crm_session=test-token", "user-agent": "Mozilla/5.0 (iPhone)" };

function databaseFor(role: "ADMIN" | "MANAGER") {
  const created: Array<Record<string, unknown>> = [];
  const session = {
    id: "session-1", userId: "user-1", lastSeenAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
    user: { id: "user-1", email: "test@example.com", name: "Тест", memberships: [{ role, status: "ACTIVE", organizationId: "org-1", organization: { id: "org-1", name: "CRM", slug: "crm" } }] },
  };
  const database = {
    client: {
      session: { async findUnique() { return session; }, async update() { return session; } },
      pilotEvent: {
        async create({ data }: { data: Record<string, unknown> }) { created.push(data); return data; },
        async deleteMany() { return { count: 0 }; },
        async findMany() { return [
          { id: "event-1", kind: "page_view", name: "open", path: "/contacts", device: "mobile", statusCode: null, durationMs: null, requestId: null, userId: "user-1", user: { id: "user-1", name: "Тест" }, createdAt: new Date() },
          { id: "event-2", kind: "api_error", name: "POST /deals", path: "/deals", device: "mobile", statusCode: 500, durationMs: 1800, requestId: "req-2", userId: "user-1", user: { id: "user-1", name: "Тест" }, createdAt: new Date() },
        ]; },
      },
    },
    async ping() {}, async disconnect() {},
  } as unknown as DatabaseConnection;
  return { database, created };
}

test("pilot events accept only known pages and use the authenticated identity", async () => {
  const { database, created } = databaseFor("MANAGER");
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: "/pilot/events", headers: cookie, payload: { kind: "page_view", path: "/contacts" } });
  const rejected = await app.inject({ method: "POST", url: "/pilot/events", headers: cookie, payload: { kind: "page_view", path: "/contacts/client-name" } });
  assert.equal(response.statusCode, 200);
  assert.equal(rejected.statusCode, 400);
  assert.equal(created.length, 1);
  assert.deepEqual({ organizationId: created[0]?.organizationId, userId: created[0]?.userId, sessionId: created[0]?.sessionId, path: created[0]?.path, device: created[0]?.device }, {
    organizationId: "org-1", userId: "user-1", sessionId: "session-1", path: "/contacts", device: "mobile",
  });
  await app.close();
});

test("only administrators can read the pilot summary", async () => {
  const manager = await buildApp(config, databaseFor("MANAGER").database);
  assert.equal((await manager.inject({ method: "GET", url: "/pilot/summary", headers: cookie })).statusCode, 403);
  await manager.close();

  const admin = await buildApp(config, databaseFor("ADMIN").database);
  const response = await admin.inject({ method: "GET", url: "/pilot/summary", headers: cookie });
  const body = response.json();
  assert.equal(response.statusCode, 200);
  assert.equal(body.members[0].visits, 1);
  assert.equal(body.members[0].problems, 1);
  assert.equal(body.members[0].slow, 1);
  assert.deepEqual(body.pages, [{ path: "/contacts", visits: 1 }]);
  assert.equal(body.recent[0].requestId, "req-2");
  await admin.close();
});

test("successful changes are recorded without URL values or request bodies", async () => {
  const { database, created } = databaseFor("ADMIN");
  const app = Fastify({ logger: false });
  await app.register(cookiePlugin);
  registerPilotRequestTracking(app, database);
  app.post("/deals/:dealId/notes", async () => ({ ok: true }));
  const response = await app.inject({ method: "POST", url: "/deals/deal-1/notes?phone=secret", headers: cookie, payload: { text: "Private client note" } });
  assert.equal(response.statusCode, 200);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.name, "POST /deals/:dealId/notes");
  assert.equal(created[0]?.path, "/deals/:dealId/notes");
  assert.equal(JSON.stringify(created[0]).includes("secret"), false);
  assert.equal(JSON.stringify(created[0]).includes("Private client note"), false);
  await app.close();
});
