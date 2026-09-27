import type { FastifyInstance } from "fastify";
import type { DatabaseConnection } from "@estate-crm/database";
import { propertyMappedImportFields, type PropertyImportPreviewResponse, type PropertyImportRow, type PropertyMappedImportPreviewResponse, type PropertyMappedImportRow } from "@estate-crm/contracts";
import { requireUser } from "../auth/require-user.js";
import { adaptImportRow, adaptMappedImportRow, expandImportRows, mappedSourceHash, sourceChanges, sourceHash, sourceHeaders } from "./import.js";

const rowSchema = { type: "object", additionalProperties: false, required: ["sheet", "rowNumber", "cells", "headers"], properties: {
  sheet: { type: "string", enum: ["квартиры", "дома", "коммерция", "аренда"] },
  rowNumber: { type: "integer", minimum: 2 },
  cells: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", maxLength: 10_000 } },
  headers: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", maxLength: 300 } },
  crmId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
  operation: { type: "string", enum: ["SALE", "RENT"] },
} } as const;

type ImportBody = { rows: PropertyImportRow[]; confirmedRows?: string[] };
type MappedImportBody = { rows: PropertyMappedImportRow[]; confirmedRows?: number[] };

const mappedValuesSchema = { type: "object", additionalProperties: false, maxProperties: propertyMappedImportFields.length, properties: Object.fromEntries(propertyMappedImportFields.map((field) => [field, { type: "string", maxLength: 10_000 }])) } as const;
const mappedRowSchema = { type: "object", additionalProperties: false, required: ["rowNumber", "sourceSheet", "values"], properties: {
  rowNumber: { type: "integer", minimum: 2 },
  sourceSheet: { type: "string", minLength: 1, maxLength: 300 },
  values: mappedValuesSchema,
} } as const;

async function previewRows(database: DatabaseConnection, organizationId: string, rows: PropertyImportRow[]): Promise<PropertyImportPreviewResponse> {
  rows = expandImportRows(rows);
  const hashes = rows.map(sourceHash);
  const crmIds = rows.flatMap((row) => row.crmId ? [row.crmId] : []);
  const existing = await database.client.property.findMany({ where: { organizationId, OR: [{ sourceHash: { in: hashes } }, { id: { in: crmIds } }, { sourceSheet: { in: ["квартиры", "дома", "коммерция"] }, sourceRow: { in: rows.map((row) => row.rowNumber) } }] } });
  const byHash = new Map(existing.filter((item) => item.sourceHash).map((item) => [item.sourceHash, item]));
  const byId = new Map(existing.map((item) => [item.id, item]));
  const bySourceRow = new Map(existing.filter((item) => item.sourceSheet && item.sourceRow).map((item) => [`${item.sourceSheet}:${item.sourceRow}:${item.operation}`, item]));
  const seen = new Set<string>();
  const result = rows.map((row) => {
    const adapted = adaptImportRow(row);
    const hash = sourceHash(row);
    const match = row.crmId ? byId.get(row.crmId) : byHash.get(hash) ?? bySourceRow.get(`${row.sheet}:${row.rowNumber}:${row.operation ?? "SALE"}`);
    const warnings = [...adapted.warnings];
    if (row.sheet !== "аренда" && sourceHeaders[row.sheet].some((expected, index) => row.headers[index]?.trim().toLocaleLowerCase("ru") !== expected.toLocaleLowerCase("ru"))) warnings.push("Заголовки листа не совпадают с форматом БАЗА.xlsx.");
    let action: "CREATE" | "UPDATE" | "SKIP" | "REVIEW" = "CREATE";
    if (!adapted.data) action = "SKIP";
    else if (warnings.some((warning) => warning.startsWith("Заголовки"))) action = "REVIEW";
    else if (row.crmId && (!match || (match.sourceSheet && match.sourceSheet !== row.sheet))) { action = "REVIEW"; warnings.push("CRM ID не соответствует объекту этого листа."); }
    else if (match && match.sourceHash === hash) action = "SKIP";
    else if (match && row.crmId) {
      action = "UPDATE";
      const previousCells = (match.sourceRaw as { cells?: string[] } | null)?.cells ?? [];
      if (!previousCells.length) { action = "REVIEW"; warnings.push("У записи нет исходной строки для сравнения."); }
      else for (const change of sourceChanges(row, previousCells)) {
        const current = (match as Record<string, unknown>)[change.name];
        if (JSON.stringify(current) !== JSON.stringify(change.before) && JSON.stringify(current) !== JSON.stringify(change.after)) { action = "REVIEW"; warnings.push(`Поле «${change.name}» изменено и в CRM, и в Excel. Сверьте значения вручную.`); }
      }
    }
    else if (match) { action = "REVIEW"; warnings.push("Строка источника изменилась без CRM ID. Сначала выгрузите базу из CRM и обновите строку с её ID."); }
    else if (!row.crmId && adapted.data.address) {
      // Changed imports without a CRM ID must be reviewed instead of creating a duplicate.
      const key = `${row.sheet}:${row.rowNumber}:${row.operation ?? "SALE"}`;
      if (seen.has(key)) { action = "REVIEW"; warnings.push("Повтор строки в файле."); }
    }
    if (adapted.data && seen.has(hash)) { action = "REVIEW"; warnings.push("Повтор объекта в файле."); }
    seen.add(hash);
    return { sheet: row.sheet, rowNumber: row.rowNumber, title: adapted.data?.title ?? `Строка ${row.rowNumber}`, category: adapted.data?.category ?? "COMMERCIAL", operation: row.operation ?? "SALE", action, warnings, existingId: match?.id ?? null };
  });
  return { rows: result, counts: { create: result.filter((row) => row.action === "CREATE").length, update: result.filter((row) => row.action === "UPDATE").length, skip: result.filter((row) => row.action === "SKIP").length, review: result.filter((row) => row.action === "REVIEW").length } };
}

async function previewMappedRows(database: DatabaseConnection, organizationId: string, rows: PropertyMappedImportRow[]): Promise<PropertyMappedImportPreviewResponse> {
  const hashes = rows.map(mappedSourceHash);
  const crmIds = rows.flatMap((row) => row.values.crmId ? [row.values.crmId] : []);
  const existing = await database.client.property.findMany({ where: { organizationId, OR: [{ sourceHash: { in: hashes } }, { id: { in: crmIds } }] } });
  const byHash = new Map(existing.filter((item) => item.sourceHash).map((item) => [item.sourceHash, item]));
  const byId = new Map(existing.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const result = rows.map((row) => {
    const adapted = adaptMappedImportRow(row);
    const hash = mappedSourceHash(row);
    const crmId = row.values.crmId?.trim();
    const match = crmId ? byId.get(crmId) : byHash.get(hash);
    const warnings = [...adapted.warnings];
    let action: "CREATE" | "UPDATE" | "SKIP" | "REVIEW" = "CREATE";
    if (crmId && !match) { action = "REVIEW"; warnings.push("CRM ID не найден в этой компании."); }
    else if (match && match.sourceHash === hash) action = "SKIP";
    else if (match && crmId) action = "UPDATE";
    else if (seen.has(hash)) { action = "REVIEW"; warnings.push("Повтор объекта в файле."); }
    seen.add(hash);
    return { rowNumber: row.rowNumber, title: adapted.data.title, category: adapted.data.category, operation: adapted.data.operation, action, warnings, existingId: match?.id ?? null };
  });
  return { rows: result, counts: { create: result.filter((row) => row.action === "CREATE").length, update: result.filter((row) => row.action === "UPDATE").length, skip: result.filter((row) => row.action === "SKIP").length, review: result.filter((row) => row.action === "REVIEW").length } };
}

export async function registerPropertyTransferRoutes(app: FastifyInstance, database: DatabaseConnection) {
  const schema = { body: { type: "object", additionalProperties: false, required: ["rows"], properties: { rows: { type: "array", minItems: 1, maxItems: 500, items: rowSchema }, confirmedRows: { type: "array", maxItems: 500, items: { type: "string", maxLength: 50 } } } } } as const;
  app.post<{ Body: ImportBody }>("/properties/import/preview", { schema }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    return previewRows(database, user.organization.id, request.body.rows);
  });
  app.post<{ Body: ImportBody }>("/properties/import/apply", { schema }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const preview = await previewRows(database, user.organization.id, request.body.rows);
    if (preview.counts.review) return reply.status(409).send({ error: "import_requires_review", message: "Исправьте строки, требующие решения, перед импортом.", preview });
    const confirmed = new Set(request.body.confirmedRows ?? []);
    const uncertain = preview.rows.filter((row) => (row.action === "CREATE" || row.action === "UPDATE") && row.warnings.length && !confirmed.has(`${row.sheet}:${row.rowNumber}:${row.operation}`));
    if (uncertain.length) return reply.status(409).send({ error: "import_requires_confirmation", message: "Подтвердите строки с замечаниями.", preview });
    let created = 0, updated = 0;
    const expandedRows = expandImportRows(request.body.rows);
    for (let index = 0; index < expandedRows.length; index++) {
      const decision = preview.rows[index]; const row = expandedRows[index];
      if (!decision || !row || decision.action === "SKIP") continue;
      const adapted = adaptImportRow(row); if (!adapted.data) continue;
      if (decision.action === "CREATE") {
        try { await database.client.property.create({ data: { organizationId: user.organization.id, ...adapted.data } }); created++; }
        catch (cause) { if ((cause as { code?: string }).code !== "P2002") throw cause; }
      } else if (decision.action === "UPDATE" && decision.existingId) {
        // Preserve CRM-only edits, ownership and photos. Source fields are refreshed only when source cells changed.
        const existing = await database.client.property.findFirst({ where: { id: decision.existingId, organizationId: user.organization.id }, select: { sourceRaw: true, assigneeId: true, assignmentNote: true } });
        if (!existing) continue;
        const previousCells = (existing.sourceRaw as { cells?: string[] } | null)?.cells ?? [];
        const changes = sourceChanges(row, previousCells);
        const fieldData = Object.fromEntries(changes.filter((change) => change.name !== "assignmentNote" || !existing.assigneeId).map((change) => [change.name, change.after]));
        await database.client.property.update({ where: { id: decision.existingId }, data: { ...fieldData, sourceSheet: row.sheet, sourceRow: row.rowNumber, sourceHash: sourceHash(row), sourceRaw: adapted.data.sourceRaw, importedAt: new Date() } }); updated++;
      }
    }
    return { created, updated, skipped: preview.counts.skip };
  });
  const mappedSchema = { body: { type: "object", additionalProperties: false, required: ["rows"], properties: { rows: { type: "array", minItems: 1, maxItems: 500, items: mappedRowSchema }, confirmedRows: { type: "array", maxItems: 500, items: { type: "integer", minimum: 2 } } } } } as const;
  app.post<{ Body: MappedImportBody }>("/properties/import/mapped/preview", { schema: mappedSchema }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    return previewMappedRows(database, user.organization.id, request.body.rows);
  });
  app.post<{ Body: MappedImportBody }>("/properties/import/mapped/apply", { schema: mappedSchema }, async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const preview = await previewMappedRows(database, user.organization.id, request.body.rows);
    if (preview.counts.review) return reply.status(409).send({ error: "import_requires_review", message: "Исправьте строки, требующие решения, перед импортом.", preview });
    const confirmed = new Set(request.body.confirmedRows ?? []);
    const uncertain = preview.rows.filter((row) => (row.action === "CREATE" || row.action === "UPDATE") && row.warnings.length && !confirmed.has(row.rowNumber));
    if (uncertain.length) return reply.status(409).send({ error: "import_requires_confirmation", message: "Подтвердите строки с замечаниями.", preview });
    let created = 0, updated = 0;
    for (let index = 0; index < request.body.rows.length; index++) {
      const row = request.body.rows[index]; const decision = preview.rows[index];
      if (!row || !decision || decision.action === "SKIP") continue;
      const adapted = adaptMappedImportRow(row);
      if (decision.action === "CREATE") {
        try { await database.client.property.create({ data: { organizationId: user.organization.id, ...adapted.data } }); created++; }
        catch (cause) { if ((cause as { code?: string }).code !== "P2002") throw cause; }
      } else if (decision.action === "UPDATE" && decision.existingId) {
        const allowed = new Set(Object.keys(row.values).filter((key) => key !== "crmId"));
        const fieldData = Object.fromEntries(Object.entries(adapted.data).filter(([key]) => allowed.has(key) || ["sourceSheet", "sourceRow", "sourceHash", "sourceRaw", "importedAt"].includes(key)));
        await database.client.property.update({ where: { id: decision.existingId }, data: fieldData }); updated++;
      }
    }
    return { created, updated, skipped: preview.counts.skip };
  });
  app.get("/properties/export", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const properties = await database.client.property.findMany({ where: { organizationId: user.organization.id, market: "SECONDARY" }, include: { assignee: { select: { name: true } }, photos: { where: { status: "READY" }, select: { id: true } } }, orderBy: [{ number: "asc" }] });
    const headers = ["CRM ID", "Код CRM", "Название", "Тип объекта", "Рынок", "Операция", "Статус", "Адрес", "Район", "Цена", "Валюта", "Цена за м²", "Комнаты", "Площадь м²", "Этаж", "Этажность", "Площадь участка, сот.", "ЖК / проект", "Застройщик", "Состояние", "Описание", "Документы", "Имя собственника", "Контакты собственника", "Ответственный", "Комментарий назначения", "Фотографии"];
    const rows = properties.map((property) => [property.id, `OD-${property.number}`, property.title, property.category, property.market, property.operation, property.status, property.address ?? "", property.district ?? "", String(property.price ?? property.priceRaw ?? ""), property.currency, String(property.pricePerSquareMeter ?? ""), property.rooms ?? "", String(property.area ?? property.areaRaw ?? ""), String(property.floor ?? ""), String(property.totalFloors ?? ""), String(property.landArea ?? ""), property.project ?? property.buildingLabel ?? "", property.developer ?? "", property.condition ?? "", property.description ?? "", property.documentNotes ?? "", property.ownerName ?? "", property.ownerContacts ?? "", property.assignee?.name ?? "", property.assignmentNote ?? "", String(property.photos.length)]);
    const sheets = { "Объекты": [headers, ...rows] };
    return { sheets, total: properties.length };
  });
}
