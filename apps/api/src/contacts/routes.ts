import type { FastifyInstance } from "fastify";

import type {
  ApiErrorResponse,
  ContactListResponse,
  ContactRecord,
  CreateContactRequest,
} from "@estate-crm/contracts";
import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";

function optionalText(value: string | undefined): string | null {
  return value?.trim() || null;
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits || null;
}

function mapContact(contact: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  source: "META" | "WEBSITE" | "MANUAL";
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: { id: string; name: string } | null;
  deals?: Array<{ id: string; number: number; request: string; budget: string | null; stage: { id: string; title: string; color: string } }>;
}): ContactRecord {
  return {
    ...contact,
    dealIds: contact.deals?.map((deal) => deal.id) ?? [],
    deals: contact.deals ?? [],
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  };
}

export async function registerContactRoutes(
  app: FastifyInstance,
  database: DatabaseConnection,
): Promise<void> {
  app.get<{
    Querystring: { q?: string };
    Reply: ContactListResponse | ApiErrorResponse;
  }>("/contacts", async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    const query = request.query.q?.trim();
    const contacts = await database.client.contact.findMany({
      where: {
        organizationId: user.organization.id,
        ...(query ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { email: { contains: query, mode: "insensitive" } },
            { telegram: { contains: query, mode: "insensitive" } },
          ],
        } : {}),
      },
      include: { assignee: { select: { id: true, name: true } }, deals: { select: { id: true, number: true, request: true, budget: true, stage: { select: { id: true, title: true, color: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return {
      contacts: contacts.map(mapContact),
      total: contacts.length,
    };
  });

  app.post<{
    Body: CreateContactRequest;
    Reply: { contact: ContactRecord } | ApiErrorResponse;
  }>("/contacts", {
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200 },
          phone: { type: "string", maxLength: 50 },
          email: { type: "string", maxLength: 320 },
          telegram: { type: "string", maxLength: 100 },
          source: { type: "string", enum: ["META", "WEBSITE", "MANUAL"] },
          assigneeId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
          comment: { type: "string", maxLength: 5_000 },
        },
      },
    },
  }, async (request, reply) => {
    const user = await requireUser(request, reply, database);
    if (!user) return reply;

    if (request.body.assigneeId) {
      const membership = await database.client.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: user.organization.id,
            userId: request.body.assigneeId,
          },
        },
      });

      if (!membership || membership.status !== "ACTIVE") {
        return reply.status(400).send({
          error: "invalid_assignee",
          message: "Ответственный не входит в эту организацию.",
        });
      }
    }

    const phone = optionalText(request.body.phone);
    const contact = await database.client.contact.create({
      data: {
        organizationId: user.organization.id,
        name: request.body.name.trim(),
        phone,
        normalizedPhone: normalizePhone(phone),
        email: optionalText(request.body.email)?.toLowerCase() ?? null,
        telegram: optionalText(request.body.telegram),
        source: request.body.source ?? "MANUAL",
        assigneeId: request.body.assigneeId ?? null,
        comment: optionalText(request.body.comment),
      },
      include: { assignee: { select: { id: true, name: true } }, deals: { select: { id: true, number: true, request: true, budget: true, stage: { select: { id: true, title: true, color: true } } } } },
    });

    return reply.status(201).send({ contact: mapContact(contact) });
  });
}
