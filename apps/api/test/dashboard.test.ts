import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const sessionUser = { id: "user-1", email: "admin@example.com", name: "Администратор", memberships: [{ role: "ADMIN" as const, organization: { id: "org-1", name: "CRM Del Mar", slug: "crm-delmar" } }] };

test("dashboard summary is calculated from current organization data", async () => {
  const database = {
    client: {
      session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser }; } },
      pipeline: { async findFirst() { return { stages: [
        { id: "stage-1", title: "Неразобранные", color: "#d6a835", position: 0, deals: [
          { id: "deal-1", assigneeId: null, tasks: [] },
          { id: "deal-2", assigneeId: "user-1", tasks: [{ id: "task-1" }] },
        ] },
      ] }; } },
      contact: { async count() { return 7; } },
      property: { async count() { return 0; } },
      activityEvent: { async findMany() { return [{ id: "activity-1", contactId: "contact-1", dealId: "deal-2", category: "TASK" as const, title: "Поставлена задача", description: "Позвонить", createdAt: new Date("2026-09-08T12:00:00.000Z"), author: { id: "user-1", name: "Администратор" }, contact: { id: "contact-1", name: "Анна" }, deal: { id: "deal-2", number: 1002, title: "Подбор квартиры", contact: { name: "Анна" } } }]; } },
    },
    async ping() {}, async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({ method: "GET", url: "/dashboard", headers: { cookie: "estate_crm_session=test-token" } });
  const payload = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(payload.deals, { total: 2, unassigned: 1, withoutTask: 1 });
  assert.equal(payload.contacts.total, 7);
  assert.equal(payload.properties.available, 0);
  assert.equal(payload.stages[0].dealCount, 2);
  assert.equal(payload.activities[0].contactName, "Анна");

  await app.close();
});
