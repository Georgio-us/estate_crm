import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mock } from "node:test";
import test from "node:test";

import type { DatabaseConnection } from "@estate-crm/database";

import { buildApp } from "../src/app.js";
import { buildTelegramNotification, deliverPendingTelegramNotifications, telegramWebhookSecret } from "../src/telegram/service.js";

const organizationId = "28f400f2-7130-420f-b88c-d0cf5107b864";
const userId = "3b9ae340-7445-4a14-8b1d-d030c882c775";
const user = { id: userId, email: "admin@example.com", name: "Администратор", memberships: [{ role: "ADMIN" as const, organization: { id: organizationId, name: "CRM Del Mar", slug: "crm-delmar" } }] };
const session = () => ({ id: "session-1", expiresAt: new Date(Date.now() + 60_000), user });
const config = {
  host: "127.0.0.1",
  port: 3001,
  webOrigins: ["https://crm.example.test"],
  databaseUrl: "postgresql://unused-in-test",
  sessionDays: 30,
  secureCookies: false,
  telegramBotToken: "123456:test-token",
  telegramBotUsername: "estate_notifications_bot",
  publicApiUrl: "https://api.example.test",
  webAppUrl: "https://crm.example.test",
};

test("Telegram notification stays short and links directly to the CRM deal", () => {
  const message = buildTelegramNotification({ title: "Новый лид", actionUrl: "/?deal=deal-42" }, config.webAppUrl);

  assert.equal(message.text, "🔔 Новый лид\n\nОткройте карточку в Estate CRM.");
  assert.equal(message.reply_markup.inline_keyboard[0]?.[0]?.url, "https://crm.example.test/?deal=deal-42");
  assert.equal(message.text.includes("телефон"), false);
});

test("CRM creates an expiring Telegram deep link and stores only its hash", async () => {
  let savedTokenHash = "";
  const database = { client: {
    session: { async findUnique() { return session(); } },
    telegramConnectToken: {
      async create(args: { data: { tokenHash: string; scope: string } }) { savedTokenHash = args.data.tokenHash; assert.equal(args.data.scope, "ORGANIZATION"); },
      async deleteMany() { return { count: 0 }; },
    },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const response = await app.inject({ method: "POST", url: "/integrations/telegram/connect", headers: { cookie: "estate_crm_session=test-token" } });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { connectUrl: string; expiresAt: string };
  const token = new URL(payload.connectUrl).searchParams.get("start");
  assert.equal(new URL(payload.connectUrl).hostname, "t.me");
  assert.ok(token);
  assert.equal(savedTokenHash, createHash("sha256").update(token).digest("hex"));
  assert.equal(savedTokenHash.includes(token), false);
  assert.ok(new Date(payload.expiresAt).getTime() > Date.now());
  await app.close();
});

test("signed Telegram webhook consumes the one-time token and binds the chat", async () => {
  const writes: string[] = [];
  const rawConnectToken = "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNO123";
  const connectToken = {
    id: "34a292bd-d84e-447c-b71a-aa185b809b88",
    organizationId,
    userId,
    scope: "ORGANIZATION" as const,
  };
  const transaction = {
    telegramConnectToken: { async updateMany() { writes.push("token-used"); return { count: 1 }; } },
    telegramRecipient: {
      async deleteMany() { writes.push("old-binding-removed"); },
      async create(args: { data: { chatId: string } }) { assert.equal(args.data.chatId, "778899"); writes.push("recipient-created"); },
    },
    integrationConnection: { async upsert() { writes.push("connection-ready"); } },
  };
  const database = { client: {
    telegramConnectToken: {
      async findFirst(args: { where: { tokenHash: string } }) {
        assert.equal(args.where.tokenHash, createHash("sha256").update(rawConnectToken).digest("hex"));
        return connectToken;
      },
    },
    async $transaction(callback: (tx: typeof transaction) => Promise<unknown>) { return callback(transaction); },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200, headers: { "content-type": "application/json" } }));
  const app = await buildApp(config, database);
  const response = await app.inject({
    method: "POST",
    url: "/webhooks/telegram",
    headers: { "x-telegram-bot-api-secret-token": telegramWebhookSecret(config.telegramBotToken) },
    payload: { message: { text: `/start ${rawConnectToken}`, chat: { id: 778899, type: "private", username: "admin" } } },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(writes, ["token-used", "old-binding-removed", "recipient-created", "connection-ready"]);
  assert.equal(fetchMock.mock.callCount(), 1);
  await app.close();
  mock.restoreAll();
});

test("outbox delivery sends once and marks both recipient delivery and notification as sent", async () => {
  const writes: string[] = [];
  let deliveryReads = 0;
  const database = { client: {
    notificationOutbox: {
      async findMany() { return [{ id: "notification-1", organizationId, channel: "TELEGRAM", status: "PENDING", title: "Новый лид", actionUrl: "/?deal=deal-42", payload: { assigneeId: null }, createdAt: new Date() }]; },
      async update(args: { data: { status?: string } }) { writes.push(`outbox-${args.data.status || "retry"}`); },
    },
    telegramRecipient: { async findMany() { return [{ id: "recipient-1", organizationId, userId, chatId: "778899", scope: "ORGANIZATION", active: true }]; } },
    notificationDelivery: {
      async createMany() { writes.push("delivery-created"); },
      async findMany() {
        deliveryReads += 1;
        return deliveryReads === 1
          ? [{ id: "delivery-1", notificationId: "notification-1", recipientId: "recipient-1", status: "PENDING", attempts: 0, nextAttemptAt: null, recipient: { chatId: "778899" } }]
          : [];
      },
      async update(args: { data: { status: string } }) { writes.push(`delivery-${args.data.status}`); },
    },
  }, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200, headers: { "content-type": "application/json" } }));
  const logger = { info() {}, warn() {}, error() {} };

  await deliverPendingTelegramNotifications(database, config.telegramBotToken, config.webAppUrl, logger);

  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(writes, ["delivery-created", "delivery-SENT", "outbox-SENT"]);
  mock.restoreAll();
});
