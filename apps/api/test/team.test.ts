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
      teamInvitation: { async findMany() { return []; } },
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

test("admin creates a real expiring invitation link", async () => {
  const database = testDatabase("ADMIN") as unknown as { client: Record<string, unknown>; disconnect(): Promise<void> };
  let invited = false;
  const client = database.client as Record<string, any>;
  client.user = {
    async findUnique() { return null; },
    async create({ data }: { data: { email: string; name: string } }) { return { id: "user-2", passwordHash: null, ...data }; },
    async update() {},
  };
  client.membership.upsert = async () => { invited = true; };
  client.teamInvitation.updateMany = async () => ({ count: 0 });
  client.teamInvitation.create = async ({ data }: { data: { expiresAt: Date } }) => ({ id: "invite-1", ...data });
  client.$transaction = async (callback: (transaction: typeof client) => unknown) => callback(client);

  const app = await buildApp(config, database as unknown as DatabaseConnection);
  const response = await app.inject({
    method: "POST",
    url: "/team/invitations",
    headers: { cookie: "estate_crm_session=test-token" },
    payload: { name: "Юлия", email: "YULIA@example.com", role: "LEAD" },
  });
  const payload = response.json();
  assert.equal(response.statusCode, 201);
  assert.equal(invited, true);
  assert.equal(payload.invitationId, "invite-1");
  assert.match(payload.connectUrl, /^http:\/\/localhost:3000\/invite\/[A-Za-z0-9_-]+$/);
  await app.close();
});

test("invited employee activates membership and receives a session", async () => {
  let activated = false;
  let sessionCreated = false;
  const client: Record<string, any> = {
    teamInvitation: {
      async findUnique() { return { id: "invite-1", organizationId: "org-1", userId: "user-2", acceptedAt: null, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user: { id: "user-2", name: "Юлия", email: "yulia@example.com", passwordHash: null }, organization: { id: "org-1", name: "Estate CRM", slug: "estate-crm" } }; },
      async update() {}, async updateMany() {},
    },
    membership: {
      async findUnique() { return { id: "membership-2", role: "LEAD", status: "INVITED" }; },
      async update() { activated = true; },
    },
    user: { async update() {} },
    session: { async create() { sessionCreated = true; } },
  };
  client.$transaction = async (callback: (transaction: typeof client) => unknown) => callback(client);
  const database = { client, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const token = "a".repeat(43);
  const response = await app.inject({ method: "POST", url: `/auth/invitations/${token}/accept`, payload: { password: "safe-password" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.organization.role, "LEAD");
  assert.equal(activated, true);
  assert.equal(sessionCreated, true);
  assert.ok(response.headers["set-cookie"]?.includes("estate_crm_session="));
  await app.close();
});

test("manager cannot read the organization team", async () => {
  const app = await buildApp(config, testDatabase("MANAGER"));
  const response = await app.inject({ method: "GET", url: "/team", headers: { cookie: "estate_crm_session=test-token" } });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().error, "forbidden");
  await app.close();
});

test("admin suspension immediately revokes sessions and Telegram delivery", async () => {
  const memberId = "7f398049-0273-4c80-9d36-56dc65069437";
  const database = testDatabase("ADMIN") as unknown as { client: Record<string, any>; disconnect(): Promise<void> };
  const client = database.client;
  const writes: string[] = [];
  client.membership.findUnique = async () => ({
    id: "membership-2", organizationId: "org-1", userId: memberId, role: "LEAD", status: "ACTIVE",
    user: { id: memberId, name: "Тимур", phone: null, _count: { assignedDeals: 2, assignedTasks: 1 } },
  });
  client.membership.count = async () => 2;
  client.membership.update = async ({ data }: { data: { status: string } }) => { writes.push(`membership-${data.status}`); };
  client.user = { async update() { writes.push("profile-updated"); } };
  client.session.deleteMany = async () => { writes.push("sessions-revoked"); };
  client.telegramRecipient = {
    async updateMany({ data }: { data: { active: boolean } }) { writes.push(`telegram-${data.active ? "active" : "inactive"}`); },
    async findUnique() { return null; },
  };
  client.contact = { async updateMany() { writes.push("contacts-unassigned"); } };
  client.deal = { async updateMany() { writes.push("deals-unassigned"); } };
  client.task = { async updateMany() { writes.push("tasks-unassigned"); } };
  client.activityEvent = { async create() { writes.push("audit-created"); } };
  client.$transaction = async (callback: (transaction: typeof client) => unknown) => callback(client);

  const app = await buildApp(config, database as unknown as DatabaseConnection);
  const response = await app.inject({
    method: "PATCH", url: `/team/${memberId}`, headers: { cookie: "estate_crm_session=test-token" },
    payload: { status: "SUSPENDED", confirmAssignedWork: true },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(writes, [
    "profile-updated",
    "membership-SUSPENDED",
    "sessions-revoked",
    "telegram-inactive",
    "contacts-unassigned",
    "deals-unassigned",
    "tasks-unassigned",
    "audit-created",
  ]);
  await app.close();
});

test("admin must explicitly confirm suspension when employee still owns work", async () => {
  const memberId = "7f398049-0273-4c80-9d36-56dc65069437";
  const database = testDatabase("ADMIN") as unknown as { client: Record<string, any>; disconnect(): Promise<void> };
  const client = database.client;
  client.membership.findUnique = async () => ({
    id: "membership-2", organizationId: "org-1", userId: memberId, role: "MANAGER", status: "ACTIVE",
    user: { id: memberId, name: "Тимур", phone: null, _count: { assignedDeals: 1, assignedTasks: 3 } },
  });
  client.membership.count = async () => 1;

  const app = await buildApp(config, database as unknown as DatabaseConnection);
  const response = await app.inject({ method: "PATCH", url: `/team/${memberId}`, headers: { cookie: "estate_crm_session=test-token" }, payload: { status: "SUSPENDED" } });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error, "assigned_work_confirmation_required");
  await app.close();
});
