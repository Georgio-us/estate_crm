import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  TelegramIntegrationSetupResponse,
  TelegramNotificationAudience,
  TelegramNotificationPreferencesResponse,
  UpdateTelegramNotificationPreferencesRequest,
} from "@estate-crm/contracts";
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

function defaultAudience(role: "ADMIN" | "LEAD" | "MANAGER"): TelegramNotificationAudience {
  return role === "ADMIN" ? "ALL" : "OWN";
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

  app.get<{ Reply: TelegramNotificationPreferencesResponse | ApiErrorResponse }>("/integrations/telegram/preferences", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const [recipient, memberships] = await Promise.all([
      database.client.telegramRecipient.findUnique({
        where: { organizationId_userId: { organizationId: user.organization.id, userId: user.id } },
        include: { selectedUsers: { select: { userId: true } } },
      }),
      database.client.membership.findMany({
        where: { organizationId: user.organization.id, status: "ACTIVE" },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      connected: Boolean(recipient?.active),
      role: user.organization.role,
      audience: recipient?.audience ?? defaultAudience(user.organization.role),
      leadNotifications: recipient?.leadNotifications ?? true,
      taskReminderNotifications: recipient?.taskReminderNotifications ?? true,
      taskOverdueNotifications: recipient?.taskOverdueNotifications ?? true,
      selectedUserIds: recipient?.selectedUsers.map((item) => item.userId) ?? [],
      members: memberships.map((membership) => ({ id: membership.user.id, name: membership.user.name, role: membership.role })),
    };
  });

  app.patch<{ Body: UpdateTelegramNotificationPreferencesRequest; Reply: TelegramNotificationPreferencesResponse | ApiErrorResponse }>("/integrations/telegram/preferences", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["audience", "leadNotifications", "taskReminderNotifications", "taskOverdueNotifications", "selectedUserIds"],
        properties: {
          audience: { type: "string", enum: ["ALL", "OWN", "SELECTED", "NONE"] },
          leadNotifications: { type: "boolean" },
          taskReminderNotifications: { type: "boolean" },
          taskOverdueNotifications: { type: "boolean" },
          selectedUserIds: { type: "array", uniqueItems: true, maxItems: 500, items: { type: "string", format: "uuid" } },
        },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    const organizationId = user.organization.id;
    const recipient = await database.client.telegramRecipient.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } } });
    if (!recipient) return reply.status(409).send({ error: "telegram_not_connected", message: "Сначала подключите свой Telegram-аккаунт." });
    if (user.organization.role === "MANAGER" && !["OWN", "NONE"].includes(request.body.audience)) {
      return reply.status(403).send({ error: "forbidden", message: "Менеджер может получать уведомления только по своим задачам." });
    }
    const selectedUserIds = request.body.audience === "SELECTED" && user.organization.role !== "MANAGER"
      ? request.body.selectedUserIds
      : [];
    if (selectedUserIds.length) {
      const count = await database.client.membership.count({
        where: { organizationId, status: "ACTIVE", userId: { in: selectedUserIds } },
      });
      if (count !== selectedUserIds.length) {
        return reply.status(400).send({ error: "invalid_team_selection", message: "В списке есть сотрудник без доступа к этой CRM." });
      }
    }
    await database.client.$transaction(async (transaction) => {
      await transaction.telegramRecipient.update({
        where: { id: recipient.id },
        data: {
          audience: request.body.audience,
          leadNotifications: request.body.leadNotifications,
          taskReminderNotifications: request.body.taskReminderNotifications,
          taskOverdueNotifications: request.body.taskOverdueNotifications,
        },
      });
      await transaction.telegramRecipientSelection.deleteMany({ where: { recipientId: recipient.id } });
      if (selectedUserIds.length) {
        await transaction.telegramRecipientSelection.createMany({
          data: selectedUserIds.map((selectedUserId) => ({ recipientId: recipient.id, userId: selectedUserId })),
          skipDuplicates: true,
        });
      }
    });
    const memberships = await database.client.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      connected: true,
      role: user.organization.role,
      audience: request.body.audience,
      leadNotifications: request.body.leadNotifications,
      taskReminderNotifications: request.body.taskReminderNotifications,
      taskOverdueNotifications: request.body.taskOverdueNotifications,
      selectedUserIds,
      members: memberships.map((membership) => ({ id: membership.user.id, name: membership.user.name, role: membership.role })),
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
    const membership = await database.client.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: connectToken.organizationId,
          userId: connectToken.userId,
        },
      },
      select: { role: true },
    });

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
          audience: membership ? defaultAudience(membership.role) : connectToken.scope === "OWN" ? "OWN" : "ALL",
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
      await replyInTelegram(String(chatId), "✅ Estate CRM подключена. Здесь будут короткие уведомления о лидах и задачах с кнопкой перехода в CRM.");
    }
    return { ok: true };
  });
}
