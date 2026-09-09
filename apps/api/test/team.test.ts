import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };

function testDatabase(role: "ADMIN" | "LEAD" | "MANAGER") {
  const sessionUser = { id: "user-1", email: "admin@example.com", name: "Георгий", memberships: [{ role, organization: { id: "org-1", name: "Estate CRM", slug: "estate-crm" } }] };
  return {
    client: {
      session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser }; } },
      organization: { async findUnique() { return { timezone: "Europe/Madrid" }; } },
      membership: { async findMany() { return [{
        role: "ADMIN" as const,
        status: "ACTIVE" as const,
        createdAt: new Date("2026-09-01T08:00:00.000Z"),
        updatedAt: new Date("2026-09-09T08:00:00.000Z"),
        user: {
          id: "user-1", name: "Георгий", email: "admin@example.com", phone: null,
          assignedDeals: [{ id: "deal-1", number: 1001, title: "Квартира", request: "Купить квартиру" }],
          assignedTasks: [{ id: "task-1", title: "Позвонить", dueDate: new Date("2020-01-01T00:00:00.000Z"), dueTime: "10:00", contact: { name: "Анна" }, deal: { id: "deal-1", number: 1001, title: "Квартира" } }],
        },
      }]; } },
    },
    async ping() {}, async disconnect() {},
  } as unknown as DatabaseConnection;
}

test("team returns real organization members and workload", async () => {
  const app = await buildApp(config, testDatabase("ADMIN"));
  const response = await app.inject({ method: "GET", url: "/team", headers: { cookie: "estate_crm_session=test-token" } });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(payload.total, 1);
  assert.equal(payload.active, 1);
  assert.equal(payload.members[0].name, "Георгий");
  assert.equal(payload.members[0].activeDeals, 1);
  assert.equal(payload.members[0].activeTasks, 1);
  assert.equal(payload.members[0].overdueTasks, 1);
  assert.equal(payload.members[0].deals[0].number, 1001);
  assert.equal(payload.members[0].tasks[0].contactName, "Анна");
  await app.close();
});

test("manager cannot read the organization team", async () => {
  const app = await buildApp(config, testDatabase("MANAGER"));
  const response = await app.inject({ method: "GET", url: "/team", headers: { cookie: "estate_crm_session=test-token" } });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "forbidden");
  await app.close();
});
