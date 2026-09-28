import type { FastifyInstance } from "fastify";

import type { DatabaseConnection } from "@estate-crm/database";

import { requireUser } from "../auth/require-user.js";
import { canManageDevelopments } from "../auth/authorization.js";

type ImportField = "unitNumber" | "building" | "section" | "floor" | "rooms" | "area" | "price" | "pricePerSquareMeter" | "currency" | "status" | "renovationType" | "renovationCompletion" | "note";
type ImportValues = Partial<Record<ImportField, string>>;
type MappedRow = { rowNumber: number; sourceSheet: string; raw: Record<string, string>; values: ImportValues };
type CheckedRow = {
  rowNumber: number; unitNumber: string; building: string | null; section: string | null;
  action: "CREATE" | "UPDATE" | "REVIEW"; warnings: string[]; errors: string[];
};
type EditableUnitField = "floor" | "rooms" | "area" | "price" | "pricePerSquareMeter" | "currency" | "status" | "renovationType" | "renovationCompletion" | "note";
type UnitUpdateBody = {
  floor?: number | null; rooms?: number | null; area?: number | null; price?: number | null; pricePerSquareMeter?: number | null;
  currency?: "USD" | "EUR" | "UAH"; status?: "AVAILABLE" | "RESERVED" | "SOLD" | "UNKNOWN";
  renovationType?: string | null; renovationCompletion?: string | null; note?: string | null;
};

const importFields = ["unitNumber", "building", "section", "floor", "rooms", "area", "price", "pricePerSquareMeter", "currency", "status", "renovationType", "renovationCompletion", "note"] as const;
const paramsSchema = { type: "object", required: ["projectId", "assetId"], properties: { projectId: { type: "string", format: "uuid" }, assetId: { type: "string", format: "uuid" } } } as const;
const rowsSchema = {
  type: "object", additionalProperties: false, required: ["rows"], properties: {
    rows: { type: "array", minItems: 1, maxItems: 1000, items: { type: "object", additionalProperties: false, required: ["rowNumber", "sourceSheet", "raw", "values"], properties: {
      rowNumber: { type: "integer", minimum: 1 }, sourceSheet: { type: "string", minLength: 1, maxLength: 300 },
      raw: { type: "object", additionalProperties: { type: "string" } },
      values: { type: "object", additionalProperties: false, properties: Object.fromEntries(importFields.map((field) => [field, { type: "string", maxLength: 500 }])) },
    } } },
  },
} as const;
const unitParamsSchema = { type: "object", required: ["projectId", "unitId"], properties: { projectId: { type: "string", format: "uuid" }, unitId: { type: "string", format: "uuid" } } } as const;
const unitFields = {
  floor: { anyOf: [{ type: "integer" }, { type: "null" }] }, rooms: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  area: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] }, price: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] },
  pricePerSquareMeter: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, currency: { type: "string", enum: ["USD", "EUR", "UAH"] },
  status: { type: "string", enum: ["AVAILABLE", "RESERVED", "SOLD", "UNKNOWN"] }, renovationType: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] },
  renovationCompletion: { anyOf: [{ type: "string", maxLength: 300 }, { type: "null" }] }, note: { anyOf: [{ type: "string", maxLength: 2_000 }, { type: "null" }] },
} as const;
const editableUnitFields = Object.keys(unitFields) as EditableUnitField[];

function clean(value: string | undefined) { const result = value?.trim(); return result || null; }
function normalized(value: string | null) { return (value || "").toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ").trim(); }
function numberValue(value: string | undefined) {
  const source = value?.trim(); if (!source) return null;
  const compact = source.replace(/\s/g, "").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  if (!/\d/.test(compact)) return Number.NaN;
  const parsed = Number(compact); return Number.isFinite(parsed) ? parsed : Number.NaN;
}
function integerValue(value: string | undefined) { const parsed = numberValue(value); return parsed === null || Number.isNaN(parsed) ? parsed : Math.round(parsed); }
function currencyValue(value: string | undefined): "USD" | "EUR" | "UAH" | null {
  const key = normalized(value ?? "USD");
  if (["usd", "$", "дол", "доллар", "доллары"].includes(key)) return "USD";
  if (["eur", "€", "евро"].includes(key)) return "EUR";
  if (["uah", "₴", "грн", "гривна", "гривны"].includes(key)) return "UAH";
  return null;
}
function statusValue(value: string | undefined): "AVAILABLE" | "RESERVED" | "SOLD" | "UNKNOWN" | null {
  const key = normalized(value ?? "UNKNOWN");
  if (["available", "доступна", "доступен", "в продаже", "свободна", "свободно"].includes(key)) return "AVAILABLE";
  if (["reserved", "резерв", "забронирована", "бронь"].includes(key)) return "RESERVED";
  if (["sold", "продана", "продано"].includes(key)) return "SOLD";
  if (["unknown", "неизвестно", "", "уточняется"].includes(key)) return "UNKNOWN";
  return null;
}

function unitRecord(unit: any) {
  return {
    id: unit.id, unitNumber: unit.unitNumber, building: unit.building?.name ?? null, section: unit.section?.name ?? null, floor: unit.floor,
    rooms: unit.rooms, roomsLabel: unit.roomsLabel, area: unit.area, price: unit.price, pricePerSquareMeter: unit.pricePerSquareMeter,
    currency: unit.currency, status: unit.status, renovationType: unit.renovationType, renovationCompletion: unit.renovationCompletion, note: unit.note,
    manualFields: Array.isArray(unit.manualFields) ? unit.manualFields : [], manualUpdatedAt: unit.manualUpdatedAt?.toISOString() ?? null,
    archivedAt: unit.archivedAt?.toISOString() ?? null, updatedAt: unit.updatedAt.toISOString(),
    ...(unit.events ? { events: unit.events.map((event: any) => ({ id: event.id, title: event.title, changes: event.changes, actorName: event.actor?.name ?? null, createdAt: event.createdAt.toISOString() })) } : {}),
  };
}

export async function registerDevelopmentImportRoutes(app: FastifyInstance, database: DatabaseConnection) {

  async function context(projectId: string, assetId: string, organizationId: string) {
    return database.client.developmentImportBatch.findFirst({
      where: { projectId, assetId, organizationId },
      include: { asset: { select: { kind: true, filename: true } } },
    });
  }

  app.post<{ Params: { projectId: string; assetId: string }; Body: { rows: MappedRow[] } }>("/development-projects/:projectId/assets/:assetId/import/preview", { schema: { params: paramsSchema, body: rowsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return reply.status(403).send({ error: "forbidden", message: "Импортировать шахматку может руководитель, администратор или менеджер с выданным правом." });
    const batch = await context(request.params.projectId, request.params.assetId, user.organization.id);
    if (!batch || batch.asset.kind !== "CHESSBOARD") return reply.status(404).send({ error: "import_not_found", message: "Черновик шахматки не найден." });
    const existing = await database.client.developmentUnit.findMany({ where: { organizationId: user.organization.id, projectId: request.params.projectId }, include: { building: { select: { name: true } }, section: { select: { name: true } } } });
    const seen = new Set<string>();
    const checked: CheckedRow[] = request.body.rows.map((row) => {
      const unitNumber = clean(row.values.unitNumber) ?? ""; const building = clean(row.values.building); const section = clean(row.values.section);
      const warnings: string[] = []; const errors: string[] = [];
      if (!unitNumber) errors.push("Не указан номер квартиры/помещения.");
      for (const [label, value, integer] of [["Этаж", row.values.floor, true], ["Площадь", row.values.area, false], ["Цена", row.values.price, true], ["Цена за м²", row.values.pricePerSquareMeter, true]] as const) {
        const parsed = integer ? integerValue(value) : numberValue(value); if (parsed !== null && Number.isNaN(parsed)) errors.push(`${label}: не удалось распознать число.`);
      }
      if (!currencyValue(row.values.currency)) errors.push("Не удалось распознать валюту.");
      if (!statusValue(row.values.status)) errors.push("Не удалось распознать статус.");
      if (section && !building) warnings.push("Указана секция без корпуса — будет создан «Основной корпус».");
      const key = `${normalized(building || (section ? "Основной корпус" : null))}|${normalized(section)}|${normalized(unitNumber)}`;
      if (unitNumber && seen.has(key)) errors.push("Такая квартира уже встречается в этом файле."); else if (unitNumber) seen.add(key);
      const match = existing.find((item) => normalized(item.unitNumber) === normalized(unitNumber) && normalized(item.building?.name ?? null) === normalized(building || (section ? "Основной корпус" : null)) && normalized(item.section?.name ?? null) === normalized(section));
      if (match && Array.isArray(match.manualFields) && match.manualFields.length) warnings.push(`Ручные поля будут сохранены: ${match.manualFields.join(", ")}.`);
      return { rowNumber: row.rowNumber, unitNumber, building, section, action: errors.length ? "REVIEW" : match ? "UPDATE" : "CREATE", warnings, errors };
    });
    const counts = { create: checked.filter((row) => row.action === "CREATE").length, update: checked.filter((row) => row.action === "UPDATE").length, review: checked.filter((row) => row.action === "REVIEW").length };
    await database.client.$transaction(async (tx) => {
      await tx.developmentImportRow.deleteMany({ where: { batchId: batch.id } });
      for (const row of request.body.rows) {
        const result = checked.find((item) => item.rowNumber === row.rowNumber)!;
        await tx.developmentImportRow.create({ data: { organizationId: user.organization.id, batchId: batch.id, rowNumber: row.rowNumber, rawData: row.raw, mappedData: { sourceSheet: row.sourceSheet, values: row.values }, issues: { warnings: result.warnings, errors: result.errors, action: result.action }, approved: !result.errors.length } });
      }
      await tx.developmentImportBatch.update({ where: { id: batch.id }, data: { status: "REVIEW_REQUIRED", parserKey: "block-xlsx-v2", summary: counts, errorMessage: null } });
      await tx.developmentAsset.update({ where: { id: batch.assetId }, data: { status: "REVIEW_REQUIRED", errorMessage: null } });
    });
    return { rows: checked, counts };
  });

  app.post<{ Params: { projectId: string; assetId: string }; Body: { confirmedRows?: number[] } }>("/development-projects/:projectId/assets/:assetId/import/publish", { schema: { params: paramsSchema, body: { type: "object", additionalProperties: false, properties: { confirmedRows: { type: "array", items: { type: "integer" }, uniqueItems: true } } } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return reply.status(403).send({ error: "forbidden" });
    const batch = await database.client.developmentImportBatch.findFirst({ where: { projectId: request.params.projectId, assetId: request.params.assetId, organizationId: user.organization.id }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
    if (!batch?.rows.length) return reply.status(409).send({ error: "preview_required", message: "Сначала проверьте сопоставление колонок." });
    const confirmations = new Set(request.body.confirmedRows ?? []);
    for (const row of batch.rows) {
      const issues = row.issues as { warnings?: string[]; errors?: string[] } | null;
      if (issues?.errors?.length) return reply.status(409).send({ error: "rows_need_review", message: "Исправьте строки с ошибками перед публикацией." });
      if (issues?.warnings?.length && !confirmations.has(row.rowNumber)) return reply.status(409).send({ error: "warnings_not_confirmed", message: "Подтвердите предупреждения перед публикацией." });
    }
    let created = 0; let updated = 0;
    await database.client.$transaction(async (tx) => {
      const buildings = new Map<string, string>(); const sections = new Map<string, string>();
      for (const row of batch.rows) {
        const mapped = row.mappedData as { sourceSheet?: string; values?: ImportValues } | null; const values = mapped?.values ?? {};
        const unitNumber = clean(values.unitNumber)!; const sectionName = clean(values.section); const buildingName = clean(values.building) || (sectionName ? "Основной корпус" : null);
        let buildingId: string | null = null; let sectionId: string | null = null;
        if (buildingName) {
          const buildingKey = normalized(buildingName); buildingId = buildings.get(buildingKey) ?? null;
          if (!buildingId) { const building = await tx.developmentBuilding.upsert({ where: { projectId_name: { projectId: batch.projectId, name: buildingName } }, update: {}, create: { organizationId: user.organization.id, projectId: batch.projectId, name: buildingName } }); buildingId = building.id; buildings.set(buildingKey, building.id); }
        }
        if (sectionName && buildingId) {
          const sectionKey = `${buildingId}:${normalized(sectionName)}`; sectionId = sections.get(sectionKey) ?? null;
          if (!sectionId) { const section = await tx.developmentSection.upsert({ where: { buildingId_name: { buildingId, name: sectionName } }, update: {}, create: { organizationId: user.organization.id, buildingId, name: sectionName } }); sectionId = section.id; sections.set(sectionKey, section.id); }
        }
        const parsedRooms = integerValue(values.rooms); const roomsLabel = clean(values.rooms);
        const data = { floor: integerValue(values.floor), rooms: parsedRooms !== null && !Number.isNaN(parsedRooms) ? parsedRooms : null, roomsLabel, area: numberValue(values.area), price: integerValue(values.price), pricePerSquareMeter: integerValue(values.pricePerSquareMeter), currency: currencyValue(values.currency)!, status: statusValue(values.status)!, renovationType: clean(values.renovationType), renovationCompletion: clean(values.renovationCompletion), note: clean(values.note), sourceData: { assetId: batch.assetId, batchId: batch.id, rowNumber: row.rowNumber, sourceSheet: mapped?.sourceSheet, raw: row.rawData } };
        const existing = await tx.developmentUnit.findFirst({ where: { projectId: batch.projectId, buildingId, sectionId, unitNumber } });
        if (existing) {
          const protectedFields = new Set(Array.isArray(existing.manualFields) ? existing.manualFields.filter((field): field is EditableUnitField => editableUnitFields.includes(field as EditableUnitField)) : []);
          const safeData = Object.fromEntries(Object.entries(data).filter(([field]) => field === "sourceData" || !protectedFields.has(field as EditableUnitField)));
          await tx.developmentUnit.update({ where: { id: existing.id }, data: { ...safeData, archivedAt: null } });
          await tx.developmentUnitEvent.create({ data: { organizationId: user.organization.id, unitId: existing.id, actorId: user.id, title: protectedFields.size ? "Обновлено из шахматки с сохранением ручных полей" : "Обновлено из шахматки", changes: { protectedFields: [...protectedFields], batchId: batch.id } } });
          updated += 1;
        }
        else { await tx.developmentUnit.create({ data: { organizationId: user.organization.id, projectId: batch.projectId, buildingId, sectionId, unitNumber, ...data } }); created += 1; }
      }
      const summary = { created, updated, total: batch.rows.length };
      await tx.developmentImportRow.updateMany({ where: { batchId: batch.id }, data: { approved: true } });
      await tx.developmentImportBatch.update({ where: { id: batch.id }, data: { status: "PUBLISHED", summary, publishedAt: new Date(), errorMessage: null } });
      await tx.developmentAsset.update({ where: { id: batch.assetId }, data: { status: "READY", errorMessage: null } });
    });
    return { created, updated, total: batch.rows.length };
  });

  app.get<{ Params: { projectId: string }; Querystring: { archived?: "only" | "all" } }>("/development-projects/:projectId/units", { schema: { params: { type: "object", required: ["projectId"], properties: { projectId: { type: "string", format: "uuid" } } } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const project = await database.client.developmentProject.findFirst({ where: { id: request.params.projectId, organizationId: user.organization.id }, select: { id: true } });
    if (!project) return reply.status(404).send({ error: "project_not_found" });
    const archiveWhere = request.query.archived === "all" ? {} : { archivedAt: request.query.archived === "only" ? { not: null } : null };
    const units = await database.client.developmentUnit.findMany({ where: { organizationId: user.organization.id, projectId: project.id, ...archiveWhere }, include: { building: { select: { name: true } }, section: { select: { name: true } } }, orderBy: [{ building: { name: "asc" } }, { section: { name: "asc" } }, { floor: "asc" }, { unitNumber: "asc" }] });
    return { units: units.map(unitRecord) };
  });

  app.get<{ Params: { projectId: string; unitId: string } }>("/development-projects/:projectId/units/:unitId", { schema: { params: unitParamsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const unit = await database.client.developmentUnit.findFirst({ where: { id: request.params.unitId, projectId: request.params.projectId, organizationId: user.organization.id }, include: { building: { select: { name: true } }, section: { select: { name: true } }, events: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 } } });
    if (!unit) return reply.status(404).send({ error: "unit_not_found", message: "Квартира не найдена." });
    return { unit: unitRecord(unit) };
  });

  app.patch<{ Params: { projectId: string; unitId: string }; Body: UnitUpdateBody }>("/development-projects/:projectId/units/:unitId", { schema: { params: unitParamsSchema, body: { type: "object", additionalProperties: false, minProperties: 1, properties: unitFields } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return reply.status(403).send({ error: "forbidden", message: "Изменять квартиры может руководитель, администратор или менеджер с выданным правом." });
    const existing = await database.client.developmentUnit.findFirst({ where: { id: request.params.unitId, projectId: request.params.projectId, organizationId: user.organization.id } });
    if (!existing) return reply.status(404).send({ error: "unit_not_found", message: "Квартира не найдена." });
    const changedFields = editableUnitFields.filter((field) => field in request.body && request.body[field] !== existing[field]);
    const manualFields = [...new Set([...(Array.isArray(existing.manualFields) ? existing.manualFields.filter((field): field is string => typeof field === "string") : []), ...changedFields])];
    const changes = Object.fromEntries(changedFields.map((field) => [field, { from: existing[field], to: request.body[field] }]));
    const unit = await database.client.$transaction(async (tx) => {
      const updated = await tx.developmentUnit.update({ where: { id: existing.id }, data: { ...request.body, manualFields, manualUpdatedAt: new Date() }, include: { building: { select: { name: true } }, section: { select: { name: true } } } });
      if (changedFields.length) await tx.developmentUnitEvent.create({ data: { organizationId: user.organization.id, unitId: existing.id, actorId: user.id, title: "Квартира изменена вручную", changes } });
      return updated;
    });
    return { unit: unitRecord(unit) };
  });

  app.post<{ Params: { projectId: string; unitId: string }; Body: { action: "archive" | "restore" } }>("/development-projects/:projectId/units/:unitId/lifecycle", { schema: { params: unitParamsSchema, body: { type: "object", additionalProperties: false, required: ["action"], properties: { action: { type: "string", enum: ["archive", "restore"] } } } } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return reply.status(403).send({ error: "forbidden" });
    const existing = await database.client.developmentUnit.findFirst({ where: { id: request.params.unitId, projectId: request.params.projectId, organizationId: user.organization.id } });
    if (!existing) return reply.status(404).send({ error: "unit_not_found" });
    const archivedAt = request.body.action === "archive" ? new Date() : null;
    await database.client.$transaction([
      database.client.developmentUnit.update({ where: { id: existing.id }, data: { archivedAt } }),
      database.client.developmentUnitEvent.create({ data: { organizationId: user.organization.id, unitId: existing.id, actorId: user.id, title: request.body.action === "archive" ? "Квартира перенесена в архив" : "Квартира восстановлена" } }),
    ]);
    return { ok: true };
  });

  app.delete<{ Params: { projectId: string; unitId: string } }>("/development-projects/:projectId/units/:unitId", { schema: { params: unitParamsSchema } }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    if (!canManageDevelopments(user)) return reply.status(403).send({ error: "forbidden" });
    const existing = await database.client.developmentUnit.findFirst({ where: { id: request.params.unitId, projectId: request.params.projectId, organizationId: user.organization.id } });
    if (!existing) return reply.status(404).send({ error: "unit_not_found" });
    if (!existing.archivedAt) return reply.status(409).send({ error: "archive_required", message: "Сначала перенесите квартиру в архив." });
    await database.client.developmentUnit.delete({ where: { id: existing.id } });
    return { ok: true };
  });
}
