import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { ApiErrorResponse, TelegramIntegrationSetupResponse } from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import type { ApiConfig } from "../config.js";
import { sendTelegramMessage, telegramWebhookSecret } from "./service.js";

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: number; type?: string; username?: string; first_name?: string };
  };
};

function hashConnectToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function secretMatches(expected: string, candidate: string): boolean {
  if (!expected || !candidate || expected.length !== candidate.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
}

export async function registerTelegramRoutes(
  app: FastifyInstance,
  config: ApiConfig,
  database: DatabaseConnection,
): Promise<void> {
  async function replyInTelegram(chatId: string, text: string): Promise<void> {
    try {
      await sendTelegramMessage(config.telegramBotToken || "", chatId, text);
    } catch (error) {
      app.log.warn({ error }, "Telegram webhook reply failed");
    }
  }

  app.post<{ Reply: TelegramIntegrationSetupResponse | ApiErrorResponse }>("/integrations/telegram/connect", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const botToken = config.telegramBotToken || "";
    const botUsername = config.telegramBotUsername || "";
    if (!botToken || !botUsername) {
      return reply.status(503).send({ error: "telegram_not_configured", message: "Telegram-бот ещё не настроен на сервере." });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const scope = user.organization.role === "MANAGER" ? "OWN" : "ORGANIZATION";
    await database.client.telegramConnectToken.create({
      data: {
        organizationId: user.organization.id,
        userId: user.id,
        tokenHash: hashConnectToken(token),
        scope,
        expiresAt,
      },
    });
    void database.client.telegramConnectToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }).catch(() => undefined);

    return {
      connectUrl: `https://t.me/${botUsername}?start=${token}`,
      expiresAt: expiresAt.toISOString(),
    };
  });

  app.post<{ Body: TelegramUpdate; Reply: { ok: true } | ApiErrorResponse }>("/webhooks/telegram", {
    schema: { body: { type: "object", additionalProperties: true } },
  }, async (request, reply) => {
    const botToken = config.telegramBotToken || "";
    const candidateSecret = typeof request.headers["x-telegram-bot-api-secret-token"] === "string"
      ? request.headers["x-telegram-bot-api-secret-token"]
      : "";
    if (!botToken || !secretMatches(telegramWebhookSecret(botToken), candidateSecret)) {
      return reply.status(401).send({ error: "invalid_telegram_webhook", message: "Неверная подпись Telegram webhook." });
    }

    const message = request.body.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim() || "";
    if (!chatId || message?.chat?.type !== "private") return { ok: true };

    const match = /^\/start(?:@[a-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{40,}))?$/i.exec(text);
    if (!match?.[1]) {
      if (text.startsWith("/start")) {
        await replyInTelegram(String(chatId), "Откройте Интеграции → Telegram в Estate CRM и нажмите «Подключить Telegram».");
      }
      return { ok: true };
    }

    const connectToken = await database.client.telegramConnectToken.findFirst({
      where: { tokenHash: hashConnectToken(match[1]), usedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!connectToken) {
      await replyInTelegram(String(chatId), "Ссылка подключения устарела или уже использована. Создайте новую в Estate CRM.");
      return { ok: true };
    }

    const connected = await database.client.$transaction(async (transaction) => {
      const claimed = await transaction.telegramConnectToken.updateMany({
        where: { id: connectToken.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;

      await transaction.telegramRecipient.deleteMany({
        where: {
          organizationId: connectToken.organizationId,
          OR: [{ userId: connectToken.userId }, { chatId: String(chatId) }],
        },
      });
      await transaction.telegramRecipient.create({
        data: {
          organizationId: connectToken.organizationId,
          userId: connectToken.userId,
          chatId: String(chatId),
          username: message.chat?.username || null,
          firstName: message.chat?.first_name || null,
          scope: connectToken.scope,
        },
      });
      await transaction.integrationConnection.upsert({
        where: { organizationId_provider: { organizationId: connectToken.organizationId, provider: "TELEGRAM" } },
        create: {
          organizationId: connectToken.organizationId,
          provider: "TELEGRAM",
          status: "CONNECTED",
          enabled: true,
          config: { transport: "BOT_API" },
        },
        update: { status: "CONNECTED", enabled: true, config: { transport: "BOT_API" }, lastError: null },
      });
      return true;
    });

    if (connected) {
      await replyInTelegram(String(chatId), "✅ Estate CRM подключена. Здесь будут только короткие уведомления и кнопка перехода к лиду.");
    }
    return { ok: true };
  });
}
