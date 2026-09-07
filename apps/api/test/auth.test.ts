import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { hashPassword } from "../src/auth/password.js";
import { buildApp } from "../src/app.js";

const config = {
  host: "127.0.0.1",
  port: 3001,
  webOrigins: ["http://localhost:3000"],
  databaseUrl: "postgresql://unused-in-test",
  sessionDays: 30,
  secureCookies: false,
};

test("login creates a server session that can be read and revoked", async () => {
  const passwordHash = await hashPassword("correct-password");
  let storedSession: { tokenHash: string; expiresAt: Date } | null = null;

  const user = {
    id: "user-1",
    email: "admin@example.com",
    name: "Администратор",
    passwordHash,
    memberships: [{
      role: "ADMIN" as const,
      organization: { id: "org-1", name: "CRM Del Mar", slug: "crm-delmar" },
    }],
  };

  const database = {
    client: {
      user: {
        async findUnique() {
          return user;
        },
      },
      session: {
        async create({ data }: { data: { tokenHash: string; expiresAt: Date } }) {
          storedSession = data;
          return data;
        },
        async findUnique() {
          return storedSession ? {
            id: "session-1",
            expiresAt: storedSession.expiresAt,
            user,
          } : null;
        },
        async deleteMany() {
          storedSession = null;
          return { count: 1 };
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "ADMIN@example.com", password: "correct-password" },
  });

  assert.equal(login.statusCode, 200);
  assert.equal(login.json().user.organization.role, "ADMIN");
  const cookie = login.headers["set-cookie"]?.split(";")[0];
  assert.ok(cookie?.startsWith("estate_crm_session="));
  assert.ok(storedSession);

  const currentSession = await app.inject({
    method: "GET",
    url: "/auth/session",
    headers: { cookie },
  });
  assert.equal(currentSession.statusCode, 200);
  assert.equal(currentSession.json().user.email, "admin@example.com");

  const logout = await app.inject({
    method: "POST",
    url: "/auth/logout",
    headers: { cookie },
  });
  assert.equal(logout.statusCode, 200);
  assert.equal(storedSession, null);

  await app.close();
});

test("login rejects an invalid password without creating a session", async () => {
  const passwordHash = await hashPassword("correct-password");
  let sessionsCreated = 0;
  const database = {
    client: {
      user: {
        async findUnique() {
          return {
            id: "user-1",
            email: "admin@example.com",
            name: "Администратор",
            passwordHash,
            memberships: [{
              role: "ADMIN" as const,
              organization: { id: "org-1", name: "CRM Del Mar", slug: "crm-delmar" },
            }],
          };
        },
      },
      session: {
        async create() {
          sessionsCreated += 1;
        },
      },
    },
    async ping() {},
    async disconnect() {},
  } as unknown as DatabaseConnection;

  const app = await buildApp(config, database);
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@example.com", password: "wrong-password" },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error, "unauthorized");
  assert.equal(sessionsCreated, 0);

  await app.close();
});
