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
          assignedProperties: [{ id: "property-1", number: 42, title: "Дом", address: "Одесса", category: "HOUSE", status: "AVAILABLE" }],
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
  assert.equal(payload.members[0].activeProperties, 1);
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
  assert.equal(payload.emailSent, false);
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

test("offboarding suspends access, transfers selected deals and creates an admin task for deferred deals", async () => {
  const memberId = "7f398049-0273-4c80-9d36-56dc65069437";
  const assigneeId = "370e22d2-72fc-4201-ad1f-cd4720c5a402";
  const dealOne = "7d9382a6-dd66-43cb-9dba-d5644e5b20b1";
  const dealTwo = "fd84b392-086a-4895-9903-37d51790489c";
  const database = testDatabase("ADMIN") as unknown as { client: Record<string, any>; disconnect(): Promise<void> };
  const client = database.client;
  const writes: string[] = [];
  client.membership.findUnique = async () => ({ id: "membership-2", organizationId: "org-1", userId: memberId, role: "LEAD", status: "ACTIVE", user: { name: "Тимур" } });
  client.membership.count = async ({ where }: { where: { userId?: string } }) => where.userId ? 1 : 2;
  client.membership.update = async () => { writes.push("suspended"); };
  client.session.deleteMany = async () => { writes.push("sessions-revoked"); };
  client.telegramRecipient = { async updateMany() { writes.push("telegram-disabled"); } };
  client.contact = { async updateMany() { writes.push("contacts-unassigned"); } };
  client.deal = {
    async findMany() { return [{ id: dealOne, number: 1, title: "Первая" }, { id: dealTwo, number: 2, title: "Вторая" }]; },
    async updateMany({ where, data }: { where: { id?: { in: string[] } }; data: { assigneeId: string | null } }) { writes.push(data.assigneeId ? `deal-${where.id?.in.join(",")}-${data.assigneeId}` : "deals-unassigned"); },
  };
  client.property = { async findMany() { return []; } };
  client.task = { async updateMany() { writes.push("tasks-unassigned"); }, async createMany({ data }: { data: Array<{ dealId: string; assigneeId: string }> }) { for (const item of data) writes.push(`admin-task-${item.dealId}-${item.assigneeId}`); } };
  client.activityEvent = { async create() { writes.push("audit-created"); } };
  client.$transaction = async (callback: (transaction: typeof client) => unknown) => callback(client);
  const app = await buildApp(config, database as unknown as DatabaseConnection);
  const response = await app.inject({ method: "POST", url: `/team/${memberId}/offboard`, headers: { cookie: "estate_crm_session=test-token" }, payload: { action: "SUSPEND", dealAssignments: [{ dealId: dealOne, assigneeId }] } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().deferredDeals, 1);
  assert.ok(writes.includes("sessions-revoked"));
  assert.ok(writes.includes(`deal-${dealOne}-${assigneeId}`));
  assert.ok(writes.includes(`admin-task-${dealTwo}-user-1`));
  assert.ok(writes.includes("suspended"));
  await app.close();
});

test("offboarding deletes an invited account and its membership", async () => {
  const memberId = "7f398049-0273-4c80-9d36-56dc65069437";
  const database = testDatabase("ADMIN") as unknown as { client: Record<string, any>; disconnect(): Promise<void> };
  const client = database.client;
  const writes: string[] = [];
  client.membership.findUnique = async () => ({ id: "membership-2", organizationId: "org-1", userId: memberId, role: "LEAD", status: "INVITED", user: { name: "Тимур" } });
  client.membership.count = async () => 1;
  client.session.deleteMany = async () => {};
  client.telegramRecipient = { async updateMany() {} };
  client.contact = { async updateMany() {} };
  client.deal = { async findMany() { return []; }, async updateMany() {} };
  client.property = { async findMany() { return []; } };
  client.task = { async updateMany() {} };
  client.teamInvitation.deleteMany = async () => { writes.push("invitations-deleted"); };
  client.user = { async delete() { writes.push("user-deleted"); } };
  client.activityEvent = { async create() { writes.push("audit-created"); } };
  client.$transaction = async (callback: (transaction: typeof client) => unknown) => callback(client);
  const app = await buildApp(config, database as unknown as DatabaseConnection);
  const response = await app.inject({ method: "POST", url: `/team/${memberId}/offboard`, headers: { cookie: "estate_crm_session=test-token" }, payload: { action: "DELETE", dealAssignments: [] } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(writes, ["invitations-deleted", "user-deleted", "audit-created"]);
  await app.close();
});

test("legacy member update cannot suspend without the offboarding flow", async () => {
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
  assert.equal(response.json().error, "offboarding_required");
  await app.close();
});
