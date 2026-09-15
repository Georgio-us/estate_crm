import type { FastifyInstance } from "fastify";
import type { DatabaseConnection } from "@estate-crm/database";
import type { PropertyImportPreviewResponse, PropertyImportRow } from "@estate-crm/contracts";
import { requireUser } from "../auth/require-user.js";
import { adaptImportRow, sourceChanges, sourceHash, sourceHeaders } from "./import.js";

const rowSchema = { type: "object", additionalProperties: false, required: ["sheet", "rowNumber", "cells", "headers"], properties: {
  sheet: { type: "string", enum: ["квартиры", "дома", "коммерция", "аренда"] },
  rowNumber: { type: "integer", minimum: 2 },
  cells: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", maxLength: 10_000 } },
  headers: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", maxLength: 300 } },
  crmId: { anyOf: [{ type: "string", format: "uuid" }, { type: "null" }] },
} } as const;

type ImportBody = { rows: PropertyImportRow[]; confirmedRows?: string[] };

async function previewRows(database: DatabaseConnection, organizationId: string, rows: PropertyImportRow[]): Promise<PropertyImportPreviewResponse> {
  const hashes = rows.map(sourceHash);
  const crmIds = rows.flatMap((row) => row.crmId ? [row.crmId] : []);
  const existing = await database.client.property.findMany({ where: { organizationId, OR: [{ sourceHash: { in: hashes } }, { id: { in: crmIds } }, { sourceSheet: { in: ["квартиры", "дома", "коммерция"] }, sourceRow: { in: rows.map((row) => row.rowNumber) } }] } });
  const byHash = new Map(existing.filter((item) => item.sourceHash).map((item) => [item.sourceHash, item]));
  const byId = new Map(existing.map((item) => [item.id, item]));
  const bySourceRow = new Map(existing.filter((item) => item.sourceSheet && item.sourceRow).map((item) => [`${item.sourceSheet}:${item.sourceRow}`, item]));
  const seen = new Set<string>();
  const result = rows.map((row) => {
    const adapted = adaptImportRow(row);
    const hash = sourceHash(row);
    const match = row.crmId ? byId.get(row.crmId) : byHash.get(hash) ?? bySourceRow.get(`${row.sheet}:${row.rowNumber}`);
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
      const key = `${row.sheet}:${row.rowNumber}`;
      if (seen.has(key)) { action = "REVIEW"; warnings.push("Повтор строки в файле."); }
    }
    if (adapted.data && seen.has(hash)) { action = "REVIEW"; warnings.push("Повтор объекта в файле."); }
    seen.add(hash);
    return { sheet: row.sheet, rowNumber: row.rowNumber, title: adapted.data?.title ?? `Строка ${row.rowNumber}`, category: adapted.data?.category ?? "COMMERCIAL", action, warnings, existingId: match?.id ?? null };
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
    const uncertain = preview.rows.filter((row) => (row.action === "CREATE" || row.action === "UPDATE") && row.warnings.length && !confirmed.has(`${row.sheet}:${row.rowNumber}`));
    if (uncertain.length) return reply.status(409).send({ error: "import_requires_confirmation", message: "Подтвердите строки с замечаниями.", preview });
    let created = 0, updated = 0;
    for (let index = 0; index < request.body.rows.length; index++) {
      const decision = preview.rows[index]; const row = request.body.rows[index];
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
  app.get("/properties/export", async (request, reply) => {
    const user = await requireUser(request, reply, database); if (!user) return reply;
    const properties = await database.client.property.findMany({ where: { organizationId: user.organization.id, market: "SECONDARY" }, include: { assignee: { select: { name: true } }, photos: { where: { status: "READY" }, select: { id: true } } }, orderBy: [{ sourceSheet: "asc" }, { sourceRow: "asc" }, { number: "asc" }] });
    const extraCols = Object.fromEntries(Object.keys(sourceHeaders).map((name) => [name, Math.max(0, ...properties.filter((property) => property.sourceSheet === name).map((property) => ((property.sourceRaw as { cells?: string[] } | null)?.cells?.length ?? 0) - sourceHeaders[name as keyof typeof sourceHeaders].length))])) as Record<string, number>;
    const sheets = Object.fromEntries(Object.entries(sourceHeaders).map(([name, headers]) => [name, [headers.concat(Array.from({ length: extraCols[name] ?? 0 }, (_, index) => `Доп. поле ${index + 1}`), ["CRM ID", "Код CRM", "Ответственный CRM", "Статус CRM", "Фото", "Комментарий о назначении", "Название CRM", "Площадь CRM", "Цена CRM"])]])) as Record<string, string[][]>;
    for (const property of properties) {
      const sheet = property.sourceSheet && property.sourceSheet in sourceHeaders ? property.sourceSheet : property.category === "COMMERCIAL" ? "коммерция" : property.category === "APARTMENT" ? "квартиры" : "дома";
      const headers = sourceHeaders[sheet as keyof typeof sourceHeaders];
      const sourceCells = (property.sourceRaw as { cells?: string[] } | null)?.cells ?? [];
      const cells = Array.from({ length: headers.length + (extraCols[sheet] ?? 0) }, (_, index) => sourceCells[index] ?? "");
      if (!sourceCells.length) {
        if (sheet === "дома") { cells[0] = property.district ?? ""; cells[1] = property.address ?? ""; cells[2] = property.subtype ?? ""; cells[3] = String(property.landArea ?? ""); cells[4] = String(property.totalFloors ?? ""); cells[5] = String(property.area ?? ""); cells[6] = property.condition ?? ""; cells[7] = property.description ?? ""; cells[8] = property.documentNotes ?? ""; cells[9] = String(property.price ?? ""); cells[10] = property.ownerName ?? ""; cells[11] = property.ownerContacts ?? ""; }
        else { cells[0] = property.buildingLabel ?? ""; cells[sheet === "коммерция" ? 2 : 1] = property.address ?? ""; cells[7] = String(property.price ?? ""); cells[8] = property.ownerName ?? ""; cells[9] = property.ownerContacts ?? ""; }
      }
      if (sourceCells.length) {
        if (sheet === "дома") { cells[0] = property.district ?? cells[0]; cells[1] = property.address ?? cells[1]; cells[2] = property.subtype ?? cells[2]; cells[3] = property.landArea === null ? cells[3] : String(property.landArea); cells[4] = property.totalFloors === null ? cells[4] : String(property.totalFloors); cells[5] = property.area === null ? cells[5] : String(property.area); cells[6] = property.condition ?? cells[6]; cells[7] = property.description ?? cells[7]; cells[8] = property.documentNotes ?? cells[8]; cells[9] = property.price === null ? cells[9] : String(property.price); cells[10] = property.ownerName ?? cells[10]; cells[11] = property.ownerContacts ?? cells[11]; }
        else { cells[0] = property.buildingLabel ?? cells[0]; cells[sheet === "коммерция" ? 2 : 1] = property.address ?? cells[sheet === "коммерция" ? 2 : 1]; cells[4] = property.area === null ? cells[4] : String(property.area); cells[5] = property.condition ?? cells[5]; cells[6] = property.description ?? cells[6]; cells[7] = property.price === null ? cells[7] : String(property.price); cells[8] = property.ownerName ?? cells[8]; cells[9] = property.ownerContacts ?? cells[9]; }
      }
      sheets[sheet]?.push(cells.concat([property.id, `OD-${property.number}`, property.assignee?.name ?? "", property.status, String(property.photos.length), property.assignmentNote ?? "", property.title, String(property.area ?? property.areaRaw ?? ""), String(property.price ?? property.priceRaw ?? "")]));
    }
    return { sheets, total: properties.length };
  });
}
