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
  body?: string;
  eventType?: string;
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
  const dealLabel = dealNumber === null ? "" : ` · ${notification.eventType?.startsWith("task.") ? "Сделка " : ""}#${dealNumber}`;
  const taskNotification = notification.eventType?.startsWith("task.") ?? false;
  const dealAssignment = notification.eventType === "deal.assigned";
  const dueLabel = taskNotification ? formatTaskDueLabel(notification.payload) : null;
  const icon = notification.eventType === "task.overdue" ? "🔴" : notification.eventType === "task.assigned" || dealAssignment ? "📌" : taskNotification ? "⏰" : "🔔";
  const details = taskNotification
    ? [notification.body?.trim(), dueLabel ? `Срок: ${dueLabel}` : null].filter(Boolean).join("\n")
    : dealAssignment
      ? [notification.body?.trim(), "Откройте карточку в Estate CRM."].filter(Boolean).join("\n")
      : "Откройте карточку в Estate CRM.";

  return {
    text: `${icon} ${notification.title}${dealLabel}\n\n${details}`,
    reply_markup: {
      inline_keyboard: [[{ text: taskNotification ? "Открыть задачу" : "Открыть лид", url: resolveCrmUrl(webAppUrl, notification.actionUrl) }]],
    },
  };
}

function readPayloadValue(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  return (payload as Record<string, unknown>)[key];
}

function readDealNumber(payload: unknown): string | null {
  const dealNumber = readPayloadValue(payload, "dealNumber");
  if (typeof dealNumber === "number" && Number.isSafeInteger(dealNumber) && dealNumber > 0) return String(dealNumber);
  if (typeof dealNumber === "string" && /^\d+$/.test(dealNumber)) return dealNumber;
  return null;
}

function formatTaskDueLabel(payload: unknown): string | null {
  const dueDate = readPayloadValue(payload, "dueDate");
  const dueTime = readPayloadValue(payload, "dueTime");
  if (typeof dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const dateLabel = new Date(`${dueDate}T00:00:00.000Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
  return typeof dueTime === "string" && /^\d{2}:\d{2}$/.test(dueTime) ? `${dateLabel}, ${dueTime}` : dateLabel;
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

type RecipientPreference = {
  userId: string;
  scope: "ORGANIZATION" | "OWN";
  audience?: "ALL" | "OWN" | "SELECTED" | "NONE";
  leadNotifications?: boolean;
  taskReminderNotifications?: boolean;
  taskOverdueNotifications?: boolean;
  selectedUsers?: Array<{ userId: string }>;
};

function recipientAccepts(notification: TelegramNotification, recipient: RecipientPreference, assigneeId: string | null): boolean {
  const eventType = notification.eventType || "";
  if (eventType === "deal.assigned") return Boolean(assigneeId) && recipient.userId === assigneeId;
  if (eventType.startsWith("lead.") && recipient.leadNotifications === false) return false;
  if (["task.assigned", "task.reminder"].includes(eventType) && recipient.taskReminderNotifications === false) return false;
  if (eventType === "task.overdue" && recipient.taskOverdueNotifications === false) return false;
  const audience = recipient.scope === "OWN" ? (recipient.audience === "NONE" ? "NONE" : "OWN") : recipient.audience ?? "ALL";
  if (audience === "NONE") return false;
  if (audience === "ALL") return true;
  if (!assigneeId) return false;
  if (audience === "OWN") return recipient.userId === assigneeId;
  return recipient.selectedUsers?.some((selection) => selection.userId === assigneeId) ?? false;
}

function localClockMillis(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
}

export async function enqueueDueTaskNotifications(database: DatabaseConnection, now = new Date()): Promise<void> {
  const organizations = await database.client.organization.findMany({
    select: {
      id: true,
      timezone: true,
      tasks: {
        where: { status: "ACTIVE", dueDate: { not: null } },
        select: {
          id: true,
          title: true,
          dueDate: true,
          dueTime: true,
          assigneeId: true,
          updatedAt: true,
          deal: { select: { id: true, number: true } },
        },
      },
    },
  });

  const rows = organizations.flatMap((organization) => {
    const currentLocalTime = localClockMillis(now, organization.timezone);
    return organization.tasks.flatMap((task) => {
      if (!task.dueDate) return [];
      const dueDate = task.dueDate.toISOString().slice(0, 10);
      const dueTime = task.dueTime || "23:59";
      const [year, month, day] = dueDate.split("-").map(Number);
      const [hour, minute] = dueTime.split(":").map(Number);
      const dueLocalTime = Date.UTC(year || 0, (month || 1) - 1, day || 1, hour || 0, minute || 0);
      const remainingMinutes = Math.floor((dueLocalTime - currentLocalTime) / 60_000);
      const eventType = remainingMinutes <= 0 ? "task.overdue" : task.dueTime && remainingMinutes <= 30 ? "task.reminder" : null;
      if (!eventType) return [];
      const version = task.updatedAt.toISOString();
      return [{
        organizationId: organization.id,
        channel: "TELEGRAM" as const,
        eventType,
        title: eventType === "task.overdue" ? "Задача просрочена" : "Задача скоро",
        body: task.title,
        actionUrl: task.deal ? `/?deal=${task.deal.id}&task=${task.id}` : `/tasks?task=${task.id}`,
        dedupeKey: `task:${task.id}:${version}:${eventType}`,
        payload: {
          taskId: task.id,
          dealId: task.deal?.id ?? null,
          dealNumber: task.deal?.number ?? null,
          assigneeId: task.assigneeId,
          dueDate,
          dueTime: task.dueTime,
        },
      }];
    });
  });
  if (rows.length) await database.client.notificationOutbox.createMany({ data: rows, skipDuplicates: true });
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
      eventType: { in: ["lead.created", "lead.repeated", "deal.assigned", "task.assigned", "task.reminder", "task.overdue"] },
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
      include: { selectedUsers: { select: { userId: true } } },
    });
    const recipients = availableRecipients.filter((recipient) => recipientAccepts(notification, recipient, assigneeId));
    if (!availableRecipients.length) continue;
    if (!recipients.length) {
      await database.client.notificationOutbox.update({
        where: { id: notification.id },
        data: { status: "CANCELLED", nextAttemptAt: null, lastError: null },
      });
      continue;
    }

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
  let nextTaskScanAt = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      if (Date.now() >= nextTaskScanAt) {
        await enqueueDueTaskNotifications(database);
        nextTaskScanAt = Date.now() + 30_000;
      }
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
