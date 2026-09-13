import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import { hashSessionToken, SESSION_COOKIE_NAME } from "../auth/session.js";

const pagePaths = new Set(["/", "/home", "/contacts", "/objects", "/tasks", "/calendar", "/integrations", "/team", "/documentation", "/subscription", "/settings"]);
const retentionMs = 30 * 24 * 60 * 60 * 1000;
let lastPruneAt = 0;

function deviceFor(request: FastifyRequest): string {
  return /Mobile|Android|iPhone|iPad/i.test(request.headers["user-agent"] ?? "") ? "mobile" : "desktop";
}

export async function registerPilotRoutes(app: FastifyInstance, database: DatabaseConnection): Promise<void> {
  app.post<{ Body: { kind: "page_view" | "browser_error"; path: string; name?: string } }>("/pilot/events", {
    schema: { body: { type: "object", additionalProperties: false, required: ["kind", "path"], properties: {
      kind: { type: "string", enum: ["page_view", "browser_error"] },
      path: { type: "string", maxLength: 60 },
      name: { type: "string", enum: ["error", "unhandled_rejection"] },
    } } },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (!pagePaths.has(request.body.path)) return reply.status(400).send({ error: "invalid_path" });

    const token = request.cookies[SESSION_COOKIE_NAME];
    const session = token ? await database.client.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, select: { id: true, lastSeenAt: true } }) : null;
    if (!session) return reply.status(401).send({ error: "unauthorized" });

    const now = new Date();
    await database.client.pilotEvent.create({ data: {
      organizationId: user.organization.id,
      userId: user.id,
      sessionId: session.id,
      kind: request.body.kind,
      name: request.body.kind === "page_view" ? "open" : (request.body.name ?? "error"),
      path: request.body.path,
      device: deviceFor(request),
    } });
    if (session.lastSeenAt < new Date(now.getTime() - 5 * 60_000)) {
      await database.client.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
    }
    if (now.getTime() - lastPruneAt > 24 * 60 * 60_000) {
      lastPruneAt = now.getTime();
      void database.client.pilotEvent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - retentionMs) } } }).catch((error: unknown) => app.log.warn({ error }, "Pilot event cleanup failed"));
    }
    return { ok: true };
  });

  app.get("/pilot/summary", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;
    if (user.organization.role !== "ADMIN") return reply.status(403).send({ error: "forbidden" });

    const since = new Date(Date.now() - 14 * 24 * 60 * 60_000);
    const events = await database.client.pilotEvent.findMany({
      where: { organizationId: user.organization.id, createdAt: { gte: since } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    const members = new Map<string, { id: string; name: string; visits: number; actions: number; problems: number; slow: number; lastSeenAt: string | null }>();
    const pages = new Map<string, number>();
    const days = new Map<string, { date: string; visits: number; actions: number; problems: number; slow: number }>();
    for (const event of events) {
      const dayKey = event.createdAt.toISOString().slice(0, 10);
      const day = days.get(dayKey) ?? { date: dayKey, visits: 0, actions: 0, problems: 0, slow: 0 };
      days.set(dayKey, day);
      const member = event.userId ? (members.get(event.userId) ?? { id: event.userId, name: event.user?.name ?? "Бывший сотрудник", visits: 0, actions: 0, problems: 0, slow: 0, lastSeenAt: null }) : null;
      if (member) {
        if (!member.lastSeenAt) member.lastSeenAt = event.createdAt.toISOString();
        members.set(member.id, member);
      }
      if (event.kind === "page_view") {
        day.visits++;
        if (member) member.visits++;
        if (event.path) pages.set(event.path, (pages.get(event.path) ?? 0) + 1);
      } else if (event.kind === "api_action") {
        day.actions++;
        if (member) member.actions++;
      } else if (event.kind === "api_error" || event.kind === "browser_error") {
        day.problems++;
        if (member) member.problems++;
      }
      if (event.kind === "api_slow" || (event.durationMs !== null && event.durationMs >= 1500)) {
        day.slow++;
        if (member) member.slow++;
      }
    }
    return {
      since: since.toISOString(),
      total: events.length,
      members: [...members.values()].sort((a, b) => b.visits - a.visits),
      pages: [...pages].map(([path, visits]) => ({ path, visits })).sort((a, b) => b.visits - a.visits),
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      recent: events.filter((event) => event.kind !== "page_view").slice(0, 80).map((event) => ({
        id: event.id, kind: event.kind, name: event.name, path: event.path, device: event.device,
        statusCode: event.statusCode, durationMs: event.durationMs, requestId: event.requestId,
        createdAt: event.createdAt.toISOString(), userName: event.user?.name ?? "Система",
      })),
      truncated: events.length === 5000,
    };
  });
}

export function registerPilotRequestTracking(app: FastifyInstance, database: DatabaseConnection): void {
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions.url;
    if (!route || route.startsWith("/pilot/") || route.startsWith("/health") || route.startsWith("/auth/")) return;
    const durationMs = Math.round(reply.elapsedTime);
    const isAction = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && reply.statusCode < 400;
    const isProblem = reply.statusCode >= 400;
    const isSlow = durationMs >= 1500;
    if (!isAction && !isProblem && !isSlow) return;
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (!token) return;
    try {
      const session = await database.client.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        select: { id: true, userId: true, user: { select: { memberships: { where: { status: "ACTIVE" }, select: { organizationId: true }, take: 1 } } } },
      });
      const organizationId = session?.user.memberships[0]?.organizationId;
      if (!session || !organizationId) return;
      await database.client.pilotEvent.create({ data: {
        organizationId, userId: session.userId, sessionId: session.id,
        kind: isProblem ? "api_error" : isAction ? "api_action" : "api_slow", name: `${request.method} ${route}`,
        path: route, device: deviceFor(request), statusCode: reply.statusCode,
        durationMs, requestId: request.id,
      } });
    } catch (error) {
      request.log.warn({ error }, "Pilot request tracking failed");
    }
  });
}
