import { createHash } from "node:crypto";

import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "../config.js";

const DELIVERY_BATCH_SIZE = 20;
const MAX_DELIVERY_ATTEMPTS = 5;

type RuntimeLogger = {
  info(bindings: object, message: string): void;
  warn(bindings: object, message: string): void;
  error(bindings: object, message: string): void;
};

type TelegramApiResponse<T = unknown> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramNotification = {
  title: string;
  actionUrl: string | null;
  payload?: unknown;
};

export function telegramWebhookSecret(botToken: string): string {
  return createHash("sha256").update(`estate-crm:${botToken}`).digest("hex");
}

async function callTelegram<T>(botToken: string, method: string, payload: object): Promise<T> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8_000),
  });
  const result = await response.json() as TelegramApiResponse<T>;

  if (!response.ok || !result.ok) {
    throw new Error(result.description || `Telegram API returned ${response.status}`);
  }

  return result.result as T;
}

function resolveCrmUrl(webAppUrl: string, actionUrl: string | null): string {
  const legacySafePath = actionUrl?.startsWith("/pipeline?")
    ? actionUrl.replace("/pipeline?", "/?")
    : actionUrl || "/";
  const base = new URL(webAppUrl);
  const resolved = new URL(legacySafePath, `${base.origin}/`);
  return resolved.origin === base.origin ? resolved.toString() : base.toString();
}

export function buildTelegramNotification(
  notification: TelegramNotification,
  webAppUrl: string,
): { text: string; reply_markup: { inline_keyboard: Array<Array<{ text: string; url: string }>> } } {
  const dealNumber = readDealNumber(notification.payload);
  const title = dealNumber === null ? notification.title : `${notification.title} · #${dealNumber}`;

  return {
    text: `🔔 ${title}\n\nОткройте карточку в Estate CRM.`,
    reply_markup: {
      inline_keyboard: [[{ text: "Открыть лид", url: resolveCrmUrl(webAppUrl, notification.actionUrl) }]],
    },
  };
}

function readDealNumber(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const dealNumber = (payload as Record<string, unknown>).dealNumber;
  if (typeof dealNumber === "number" && Number.isSafeInteger(dealNumber) && dealNumber > 0) return String(dealNumber);
  if (typeof dealNumber === "string" && /^\d+$/.test(dealNumber)) return dealNumber;
  return null;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  replyMarkup?: object,
): Promise<void> {
  await callTelegram(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function registerWebhook(config: ApiConfig, logger: RuntimeLogger): Promise<void> {
  const botToken = config.telegramBotToken || "";
  const publicApiUrl = config.publicApiUrl || "";
  if (!botToken || !publicApiUrl) {
    logger.warn({}, "Telegram webhook was not registered because the public API URL is unavailable");
    return;
  }

  await callTelegram(botToken, "setWebhook", {
    url: `${publicApiUrl}/webhooks/telegram`,
    secret_token: telegramWebhookSecret(botToken),
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  logger.info({}, "Telegram webhook registered");
}

function readAssigneeId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const assigneeId = (payload as Record<string, unknown>).assigneeId;
  return typeof assigneeId === "string" ? assigneeId : null;
}

function retryAt(attempts: number): Date {
  const seconds = Math.min(300, 5 * (2 ** Math.max(0, attempts - 1)));
  return new Date(Date.now() + seconds * 1_000);
}

export async function deliverPendingTelegramNotifications(
  database: DatabaseConnection,
  botToken: string,
  webAppUrl: string,
  logger: RuntimeLogger,
): Promise<void> {
  const now = new Date();
  const notifications = await database.client.notificationOutbox.findMany({
    where: {
      channel: "TELEGRAM",
      eventType: { in: ["lead.created", "lead.repeated"] },
      status: "PENDING",
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: DELIVERY_BATCH_SIZE,
  });

  for (const notification of notifications) {
    const assigneeId = readAssigneeId(notification.payload);
    const availableRecipients = await database.client.telegramRecipient.findMany({
      where: { organizationId: notification.organizationId, active: true },
    });
    const recipients = availableRecipients.filter((recipient) => (
      recipient.scope === "ORGANIZATION" || (assigneeId !== null && recipient.userId === assigneeId)
    ));
    if (!recipients.length) continue;

    await database.client.notificationDelivery.createMany({
      data: recipients.map((recipient) => ({ notificationId: notification.id, recipientId: recipient.id })),
      skipDuplicates: true,
    });
    const deliveries = await database.client.notificationDelivery.findMany({
      where: {
        notificationId: notification.id,
        recipientId: { in: recipients.map((recipient) => recipient.id) },
        status: { in: ["PENDING", "FAILED"] },
      },
      include: { recipient: true },
    });
    const content = buildTelegramNotification(notification, webAppUrl);

    for (const delivery of deliveries) {
      if (delivery.attempts >= MAX_DELIVERY_ATTEMPTS || (delivery.nextAttemptAt && delivery.nextAttemptAt > now)) continue;

      try {
        await sendTelegramMessage(botToken, delivery.recipient.chatId, content.text, content.reply_markup);
        await database.client.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", attempts: { increment: 1 }, sentAt: new Date(), nextAttemptAt: null, lastError: null },
        });
      } catch (error) {
        const attempts = delivery.attempts + 1;
        const message = error instanceof Error ? error.message.slice(0, 1_000) : "Telegram delivery failed";
        await database.client.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: "FAILED", attempts, nextAttemptAt: attempts < MAX_DELIVERY_ATTEMPTS ? retryAt(attempts) : null, lastError: message },
        });
        logger.warn({ notificationId: notification.id, recipientId: delivery.recipientId, error: message }, "Telegram notification delivery failed");
      }
    }

    const remaining = await database.client.notificationDelivery.findMany({
      where: { notificationId: notification.id, recipientId: { in: recipients.map((recipient) => recipient.id) }, status: { not: "SENT" } },
      select: { attempts: true, nextAttemptAt: true },
    });
    if (!remaining.length) {
      await database.client.notificationOutbox.update({
        where: { id: notification.id },
        data: { status: "SENT", sentAt: new Date(), nextAttemptAt: null, lastError: null },
      });
    } else {
      const retryable = remaining.filter((delivery) => delivery.attempts < MAX_DELIVERY_ATTEMPTS);
      await database.client.notificationOutbox.update({
        where: { id: notification.id },
        data: retryable.length
          ? {
              attempts: { increment: 1 },
              nextAttemptAt: retryable.reduce<Date | null>((earliest, delivery) => {
                if (!delivery.nextAttemptAt) return earliest;
                return !earliest || delivery.nextAttemptAt < earliest ? delivery.nextAttemptAt : earliest;
              }, null),
            }
          : { status: "FAILED", attempts: { increment: 1 }, nextAttemptAt: null, lastError: "Telegram delivery attempts exhausted" },
      });
    }
  }
}

export function startTelegramRuntime(
  config: ApiConfig,
  database: DatabaseConnection,
  logger: RuntimeLogger,
): { stop(): void } {
  const botToken = config.telegramBotToken || "";
  const webAppUrl = config.webAppUrl || config.webOrigins[0] || "http://localhost:3000";
  if (!botToken) {
    logger.warn({}, "Telegram runtime is disabled because TELEGRAM_BOT_TOKEN is missing");
    return { stop() {} };
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await deliverPendingTelegramNotifications(database, botToken, webAppUrl, logger);
    } catch (error) {
      logger.error({ error }, "Telegram outbox worker failed");
    } finally {
      running = false;
    }
  };

  void registerWebhook(config, logger).catch((error) => {
    logger.error({ error }, "Telegram webhook registration failed");
  });
  void tick();
  const timer = setInterval(() => void tick(), 3_000);
  timer.unref();

  return { stop() { clearInterval(timer); } };
}
