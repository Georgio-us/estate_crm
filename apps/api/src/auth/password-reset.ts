import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { DatabaseConnection } from "@estate-crm/database";

import type { ApiConfig } from "../config.js";
import { emailConfigured, sendTransactionalEmail } from "../lib/email.js";
import { hashPassword } from "./password.js";

const resetLifetimeMs = 30 * 60_000;
const hourMs = 60 * 60_000;
const responseFloorMs = 4_200;
const genericResponse = { ok: true, message: "Если этот email зарегистрирован в CRM, мы отправили ссылку для восстановления пароля." };
let lastCleanupAt = 0;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

async function genericAfter(startedAt: number): Promise<typeof genericResponse> {
  const remaining = responseFloorMs - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  return genericResponse;
}

export async function registerPasswordResetRoutes(app: FastifyInstance, config: ApiConfig, database: DatabaseConnection): Promise<void> {
  app.get("/auth/email-status", async () => ({ available: emailConfigured(config) }));

  app.post<{ Body: { email: string } }>("/auth/request-reset", {
    schema: { body: { type: "object", additionalProperties: false, required: ["email"], properties: { email: { type: "string", minLength: 3, maxLength: 320 } } } },
  }, async (request, reply) => {
    const startedAt = Date.now();
    reply.header("Cache-Control", "no-store");
    if (!emailConfigured(config)) return reply.status(503).send({ error: "email_unavailable", message: "Восстановление пароля временно недоступно. Обратитесь к администратору CRM." });

    const email = request.body.email.trim().toLowerCase();
    const emailHash = digest(email);
    const ipHash = digest(request.ip);
    const now = new Date();
    const [emailRequests, ipRequests] = await Promise.all([
      database.client.passwordResetToken.count({ where: { emailHash, createdAt: { gte: new Date(now.getTime() - hourMs) } } }),
      database.client.passwordResetToken.count({ where: { ipHash, createdAt: { gte: new Date(now.getTime() - hourMs) } } }),
    ]);
    if (emailRequests >= 3 || ipRequests >= 30) return genericAfter(startedAt);

    const user = await database.client.user.findUnique({ where: { email }, include: { memberships: { where: { status: "ACTIVE" }, select: { organizationId: true }, take: 1 } } });
    const eligible = Boolean(user?.passwordHash && user.memberships.length);
    const token = eligible ? newToken() : null;
    const reset = await database.client.passwordResetToken.create({ data: {
      organizationId: eligible ? user!.memberships[0]!.organizationId : null,
      userId: eligible ? user!.id : null,
      emailHash, ipHash,
      tokenHash: token ? digest(token) : null,
      expiresAt: token ? new Date(now.getTime() + resetLifetimeMs) : null,
    } });
    if (now.getTime() - lastCleanupAt > 24 * hourMs) {
      lastCleanupAt = now.getTime();
      void database.client.passwordResetToken.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 24 * hourMs) } } })
        .catch((error: unknown) => app.log.warn({ error }, "Expired password reset records cleanup failed"));
    }
    if (token) {
      try {
        await sendTransactionalEmail(config, {
          to: email,
          subject: "Восстановление пароля Estate CRM",
          text: `Для установки нового пароля откройте ссылку:\n${config.webAppUrl}/reset-password/${token}\n\nСсылка действует 30 минут и используется один раз. Если вы не запрашивали восстановление, просто проигнорируйте письмо.`,
          idempotencyKey: `password-reset-${reset.id}`,
        });
      } catch (error) {
        await database.client.passwordResetToken.update({ where: { id: reset.id }, data: { consumedAt: new Date() } });
        app.log.warn({ resetId: reset.id, error }, "Password reset email delivery failed");
      }
    }
    return genericAfter(startedAt);
  });

  app.post<{ Body: { token: string; password: string } }>("/auth/reset-password", {
    schema: { body: { type: "object", additionalProperties: false, required: ["token", "password"], properties: {
      token: { type: "string", minLength: 40, maxLength: 100 },
      password: { type: "string", minLength: 8, maxLength: 256 },
    } } },
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const reset = await database.client.passwordResetToken.findUnique({ where: { tokenHash: digest(request.body.token) }, include: { user: true } });
    if (!reset || !reset.userId || !reset.user || reset.consumedAt || !reset.expiresAt || reset.expiresAt <= new Date()) {
      return reply.status(400).send({ error: "invalid_reset_link", message: "Ссылка недействительна или срок её действия истёк. Запросите новую." });
    }

    const passwordHash = await hashPassword(request.body.password);
    const changed = await database.client.$transaction(async (transaction) => {
      const claimed = await transaction.passwordResetToken.updateMany({ where: { id: reset.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
      if (claimed.count !== 1) return false;
      await transaction.user.update({ where: { id: reset.userId! }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: reset.userId! } });
      await transaction.passwordResetToken.updateMany({ where: { userId: reset.userId!, consumedAt: null }, data: { consumedAt: new Date() } });
      return true;
    });
    if (!changed) return reply.status(400).send({ error: "invalid_reset_link", message: "Ссылка уже использована. Запросите новую." });

    if (emailConfigured(config)) {
      try {
        await sendTransactionalEmail(config, {
          to: reset.user.email,
          subject: "Пароль Estate CRM изменён",
          text: "Пароль вашей учётной записи Estate CRM был изменён. Все прежние сеансы завершены. Если это сделали не вы, сразу свяжитесь с администратором CRM.",
          idempotencyKey: `password-changed-${reset.id}`,
        });
      } catch (error) {
        app.log.warn({ resetId: reset.id, error }, "Password change notice delivery failed");
      }
    }
    return { ok: true };
  });
}
