import assert from "node:assert/strict";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";

function createDatabaseStub(options: { healthy: boolean }): DatabaseConnection {
  return {
    client: {} as DatabaseConnection["client"],
    async ping() {
      if (!options.healthy) {
        throw new Error("Database unavailable");
      }
    },
    async disconnect() {},
  };
}

test("GET /health reports a healthy API process", async () => {
  const app = await buildApp({
    host: "127.0.0.1",
    port: 3001,
    webOrigins: ["http://localhost:3000"],
    databaseUrl: "postgresql://unused-in-test",
  }, createDatabaseStub({ healthy: true }));

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /application\/json/);
  assert.deepEqual(
    Object.keys(response.json()).sort(),
    ["database", "service", "status", "timestamp", "version"],
  );
  assert.equal(response.json().status, "ok");
  assert.equal(response.json().service, "estate-crm-api");
  assert.equal(response.json().database, "connected");

  await app.close();
});

test("GET /health reports when PostgreSQL is unavailable", async () => {
  const app = await buildApp({
    host: "127.0.0.1",
    port: 3001,
    webOrigins: ["http://localhost:3000"],
    databaseUrl: "postgresql://unused-in-test",
  }, createDatabaseStub({ healthy: false }));

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json().status, "error");
  assert.equal(response.json().database, "unavailable");

  await app.close();
});
