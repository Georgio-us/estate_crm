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

const sessionUser = {
  id: "user-1",
  email: "admin@example.com",
  name: "Администратор",
  memberships: [{
    role: "ADMIN" as const,
    organization: { id: "org-1", name: "CRM Del Mar", slug: "crm-delmar" },
  }],
};

test("contacts are listed only for the authenticated organization", async () => {
  let requestedOrganization = "";
  const database = {
    client: {
      session: {
        async findUnique() {
          return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser };
        },
      },
      contact: {
        async findMany({ where }: { where: { organizationId: string } }) {
          requestedOrganization = where.organizationId;
          return [{
            id: "contact-1",
            name: "Анна Коваленко",
            phone: "+38 093 412 68 20",
            email: null,
            telegram: "@anna",
            source: "MANUAL" as const,
            comment: null,
            createdAt: new Date("2026-09-07T12:00:00.000Z"),
            updatedAt: new Date("2026-09-07T12:00:00.000Z"),
            assignee: null,
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
    url: "/contacts",
    headers: { cookie: "estate_crm_session=test-token" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(requestedOrganization, "org-1");
  assert.equal(response.json().contacts[0].name, "Анна Коваленко");

  await app.close();
});

test("creating a contact persists normalized data in the current organization", async () => {
  let createdData: Record<string, unknown> = {};
  const database = {
    client: {
      session: {
        async findUnique() {
          return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: sessionUser };
        },
      },
      contact: {
        async create({ data }: { data: Record<string, unknown> }) {
          createdData = data;
          const now = new Date("2026-09-07T12:00:00.000Z");
          return {
            id: "contact-1",
            ...data,
            source: "MANUAL" as const,
            createdAt: now,
            updatedAt: now,
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
    url: "/contacts",
    headers: { cookie: "estate_crm_session=test-token" },
    payload: {
      name: "  Мария Иванова  ",
      phone: "+38 (093) 123-45-67",
      email: "MARIA@EXAMPLE.COM",
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(createdData.organizationId, "org-1");
  assert.equal(createdData.name, "Мария Иванова");
  assert.equal(createdData.normalizedPhone, "380931234567");
  assert.equal(createdData.email, "maria@example.com");

  await app.close();
});
