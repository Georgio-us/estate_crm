import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";
import { buildApp } from "../src/app.js";
import { verifyPassword } from "../src/auth/password.js";

const baseConfig = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false, webAppUrl: "https://crm.example.com" };

test("password recovery uses an expiring one-use link and ends old sessions", async () => {
  const originalFetch = globalThis.fetch;
  const sent: Array<{ subject: string; text: string; to: string[] }> = [];
  globalThis.fetch = async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)) as { subject: string; text: string; to: string[] });
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  };
  let passwordHash = "old-hash";
  let revokedSessions = 0;
  const records: Array<{ id: string; userId: string | null; tokenHash: string | null; expiresAt: Date | null; consumedAt: Date | null; user?: { email: string } }> = [];
  const client = {
    passwordResetToken: {
      async count() { return records.length; },
      async create({ data }: { data: { userId: string | null; tokenHash: string | null; expiresAt: Date | null } }) {
        const record = { id: `reset-${records.length + 1}`, ...data, consumedAt: null, user: data.userId ? { email: "member@example.com" } : undefined };
        records.push(record);
        return record;
      },
      async findUnique({ where }: { where: { tokenHash: string } }) { return records.find((record) => record.tokenHash === where.tokenHash) ?? null; },
      async updateMany({ where, data }: { where: { id?: string; userId?: string; consumedAt: null }; data: { consumedAt: Date } }) {
        const matches = records.filter((record) => (!where.id || record.id === where.id) && (!where.userId || record.userId === where.userId) && !record.consumedAt);
        matches.forEach((record) => { record.consumedAt = data.consumedAt; });
        return { count: matches.length };
      },
      async deleteMany() { return { count: 0 }; },
    },
    user: {
      async findUnique({ where }: { where: { email: string } }) {
        return where.email === "member@example.com" ? { id: "user-1", email: "member@example.com", passwordHash, memberships: [{ organizationId: "org-1" }] } : null;
      },
      async update({ data }: { data: { passwordHash: string } }) { passwordHash = data.passwordHash; return { id: "user-1" }; },
    },
    session: { async deleteMany() { revokedSessions++; return { count: 2 }; } },
    async $transaction<T>(fn: (transaction: typeof client) => Promise<T>) { return fn(client); },
  };
  const database = { client, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp({ ...baseConfig, emailApiKey: "test-key", emailFrom: "Estate CRM <crm@example.com>" }, database);
  try {
    const unknown = await app.inject({ method: "POST", url: "/auth/request-reset", payload: { email: "unknown@example.com" } });
    const known = await app.inject({ method: "POST", url: "/auth/request-reset", payload: { email: "member@example.com" } });
    assert.equal(unknown.statusCode, 200);
    assert.equal(known.statusCode, 200);
    assert.deepEqual(unknown.json(), known.json());
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.to, ["member@example.com"]);
    const token = sent[0]?.text.match(/\/reset-password\/([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(token);

    const changed = await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token, password: "new-strong-password" } });
    assert.equal(changed.statusCode, 200);
    assert.equal(await verifyPassword("new-strong-password", passwordHash), true);
    assert.equal(revokedSessions, 1);
    assert.equal(sent.length, 2);

    const repeated = await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token, password: "another-password" } });
    assert.equal(repeated.statusCode, 400);
    assert.equal(revokedSessions, 1);

    await app.inject({ method: "POST", url: "/auth/request-reset", payload: { email: "member@example.com" } });
    const expiredToken = sent[2]?.text.match(/\/reset-password\/([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(expiredToken);
    records[2]!.expiresAt = new Date(Date.now() - 1_000);
    const expired = await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token: expiredToken, password: "another-password" } });
    assert.equal(expired.statusCode, 400);
  } finally {
    await app.close();
    globalThis.fetch = originalFetch;
  }
});

test("recovery is unavailable for everyone until email delivery is configured", async () => {
  const database = { client: {}, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(baseConfig, database);
  const status = await app.inject({ method: "GET", url: "/auth/email-status" });
  assert.deepEqual(status.json(), { available: false });
  const response = await app.inject({ method: "POST", url: "/auth/request-reset", payload: { email: "member@example.com" } });
  assert.equal(response.statusCode, 503);
  await app.close();
});
