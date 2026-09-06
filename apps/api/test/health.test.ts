import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";

test("GET /health reports a healthy API process", async () => {
  const app = await buildApp({
    host: "127.0.0.1",
    port: 3001,
    webOrigins: ["http://localhost:3000"],
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /application\/json/);
  assert.deepEqual(
    Object.keys(response.json()).sort(),
    ["service", "status", "timestamp", "version"],
  );
  assert.equal(response.json().status, "ok");
  assert.equal(response.json().service, "estate-crm-api");

  await app.close();
});
