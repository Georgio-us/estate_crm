import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { ViaRemoteClient, viaBaseUrl } from "../src/integrations/via/client.js";
import { parseViaEvent } from "../src/integrations/via/routes.js";
import { decryptViaCredential, encryptViaCredential, signViaRequest, verifyViaRequestSignature } from "../src/integrations/via/security.js";

test("Via signatures bind the connection, request path, body and timestamp", () => {
  const now = 1_800_000_000_000;
  const timestamp = String(now);
  const input = { secret: "secret", timestamp, connectionId: "connection-1", method: "POST", path: "/api/integrations/via/events", body: '{"eventId":"event-1"}', now };
  const signature = signViaRequest(input.secret, timestamp, input.connectionId, input.method, input.path, input.body);
  assert.equal(verifyViaRequestSignature({ ...input, signature }), true);
  assert.equal(verifyViaRequestSignature({ ...input, path: "/api/integrations/via/other", signature }), false);
  assert.equal(verifyViaRequestSignature({ ...input, body: '{"eventId":"event-2"}', signature }), false);
  assert.equal(verifyViaRequestSignature({ ...input, connectionId: "connection-2", signature }), false);
  assert.equal(verifyViaRequestSignature({ ...input, now: now + 5 * 60_000 + 1, signature }), false);
  assert.equal(verifyViaRequestSignature({ ...input, signature: "invalid" }), false);
});

test("Via credential encryption authenticates ciphertext", () => {
  const key = randomBytes(32);
  const encrypted = encryptViaCredential("server-held-shared-credential", key);
  assert.equal(decryptViaCredential(encrypted, key), "server-held-shared-credential");
  assert.throws(() => decryptViaCredential(encrypted, randomBytes(32)));
});

test("Via origin is deployment-configured and rejects non-root or insecure remote URLs", () => {
  assert.equal(viaBaseUrl({ viaApiBaseUrl: "https://via.example.com", host: "", port: 1, webOrigins: [], databaseUrl: "", sessionDays: 30, secureCookies: true })?.origin, "https://via.example.com");
  assert.equal(viaBaseUrl({ viaApiBaseUrl: "http://via.example.com", host: "", port: 1, webOrigins: [], databaseUrl: "", sessionDays: 30, secureCookies: true }), null);
  assert.equal(viaBaseUrl({ viaApiBaseUrl: "https://via.example.com/private", host: "", port: 1, webOrigins: [], databaseUrl: "", sessionDays: 30, secureCookies: true }), null);
});

test("Via outbound client signs its fixed integration path without exposing credentials in URL", async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; method: string; headers: Headers; body: string } | null = null;
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), method: String(init?.method), headers: new Headers(init?.headers), body: String(init?.body ?? "") };
    return new Response(JSON.stringify({ items: [], nextCursor: null }), { headers: { "content-type": "application/json" } });
  };
  try {
    const client = new ViaRemoteClient(new URL("https://via.example.com"), "connection-1", "shared-secret");
    await client.request("GET", "/api/integrations/estate/v1/properties?cursor=next");
    assert.ok(captured);
    const request = captured as { url: string; method: string; headers: Headers; body: string };
    assert.equal(request.url, "https://via.example.com/api/integrations/estate/v1/properties?cursor=next");
    assert.equal(request.headers.get("x-integration-connection"), "connection-1");
    assert.equal(request.headers.get("x-integration-signature"), signViaRequest("shared-secret", request.headers.get("x-integration-timestamp")!, "connection-1", "GET", "/api/integrations/estate/v1/properties?cursor=next", ""));
    assert.equal(request.body, "");
    await assert.rejects(() => client.request("GET", "https://malicious.example.com/"));
  } finally { globalThis.fetch = originalFetch; }
});

test("Via events discard unexpected raw transcript fields before CRM persistence", () => {
  const parsed = parseViaEvent({
    eventId: "event-1", connectionId: "ebc9b923-6514-460f-9ca2-c44d2d55c121", type: "session.completed_summary",
    occurredAt: "2026-09-15T12:00:00.000Z", viaTenant: "delmar", crmContextId: "context-1",
    rawTranscript: [{ role: "user", text: "private chat" }], session: { sessionId: "session-1", summary: "Short summary", rawTranscript: "private chat" },
  });
  assert.ok(parsed);
  assert.equal(JSON.stringify(parsed).includes("private chat"), false);
  assert.equal(parsed.session?.summary, "Short summary");
});
