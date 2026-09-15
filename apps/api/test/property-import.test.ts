import assert from "node:assert/strict";
import test from "node:test";
import type { DatabaseConnection } from "@estate-crm/database";
import { buildApp } from "../src/app.js";

const config = { host: "127.0.0.1", port: 3001, webOrigins: ["http://localhost:3000"], databaseUrl: "postgresql://unused-in-test", sessionDays: 30, secureCookies: false };
const cookie = { cookie: "estate_crm_session=test-token" };

test("Excel preview, apply, repeated upload and export keep owner and source cells", async () => {
  const records: Array<Record<string, any>> = [];
  const client: Record<string, any> = {
    session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: { id: "user-1", name: "Admin", email: "admin@example.com", memberships: [{ role: "ADMIN", organization: { id: "org-1", name: "CRM", slug: "crm" } }] } }; } },
    property: {
      async findMany({ where }: { where: Record<string, any> }) {
        if (where.market === "SECONDARY") return records.map((record) => ({ ...record, assignee: null, photos: [] }));
        return records.filter((record) => where.OR.some((clause: Record<string, any>) => clause.sourceHash?.in?.includes(record.sourceHash) || clause.id?.in?.includes(record.id) || (clause.sourceSheet?.in?.includes(record.sourceSheet) && clause.sourceRow?.in?.includes(record.sourceRow))));
      },
      async create({ data }: { data: Record<string, any> }) { records.push({ ...data, id: "f48ab88b-b1cb-4adf-b930-3537767cfb92", number: records.length + 1 }); },
      async findFirst({ where }: { where: { id: string } }) { return records.find((record) => record.id === where.id); },
      async update({ where, data }: { where: { id: string }; data: Record<string, any> }) { Object.assign(records.find((record) => record.id === where.id)!, data); },
    },
  };
  const database = { client, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection;
  const app = await buildApp(config, database);
  const cells = ["ЖК Тест", "ул. Тестовая 1", "2", "3/9", "62", "хорошее", "Описание", "120000", "Собственник", "+380000000", "Риелтор", "важная безымянная ячейка"];
  const headers = ["ЖК", "Адрес, секция, № кв.", "Кол-во комнат", "Этаж/Эт-сть", "м²", "Состояние", "Описание, документы", "Цена,$", "ФИО", "Контакты", "Риелтор"];
  const rows = [{ sheet: "квартиры", rowNumber: 2, cells, headers }];
  const preview = await app.inject({ method: "POST", url: "/properties/import/preview", headers: cookie, payload: { rows } });
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json().counts.create, 1);
  const applied = await app.inject({ method: "POST", url: "/properties/import/apply", headers: cookie, payload: { rows } });
  assert.equal(applied.statusCode, 200);
  assert.equal(applied.json().created, 1);
  assert.equal(records[0]?.ownerName, "Собственник");
  assert.equal(records[0]?.ownerContacts, "+380000000");
  assert.equal(records[0]?.assigneeId, undefined);
  assert.equal(records[0]?.assignmentNote, "Назначить ответственного (Риелтор)");
  const repeated = await app.inject({ method: "POST", url: "/properties/import/apply", headers: cookie, payload: { rows } });
  assert.equal(repeated.json().created, 0);
  const exported = await app.inject({ method: "GET", url: "/properties/export", headers: cookie });
  assert.equal(exported.statusCode, 200);
  const sheet = exported.json().sheets.квартиры as string[][];
  assert.equal(sheet[1]?.[11], "важная безымянная ячейка");
  assert.equal(sheet[1]?.[12], "f48ab88b-b1cb-4adf-b930-3537767cfb92");
  // Source price can change without erasing a CRM-only title edit.
  records[0]!.title = "Ручное название";
  const changedRows = [{ sheet: "квартиры", rowNumber: 2, cells: cells.map((cell, index) => index === 7 ? "130000" : cell), headers, crmId: records[0]!.id }];
  const changedPreview = await app.inject({ method: "POST", url: "/properties/import/preview", headers: cookie, payload: { rows: changedRows } });
  assert.equal(changedPreview.json().rows[0].action, "UPDATE");
  const changedApplied = await app.inject({ method: "POST", url: "/properties/import/apply", headers: cookie, payload: { rows: changedRows } });
  assert.equal(changedApplied.json().updated, 1);
  assert.equal(records[0]?.title, "Ручное название");
  assert.equal(records[0]?.price, 130000);
  // Two competing edits to the owner field are held for review.
  records[0]!.ownerName = "Изменено в CRM";
  const conflictingRows = [{ ...changedRows[0]!, cells: changedRows[0]!.cells.map((cell, index) => index === 8 ? "Изменено в Excel" : cell) }];
  const conflict = await app.inject({ method: "POST", url: "/properties/import/preview", headers: cookie, payload: { rows: conflictingRows } });
  assert.equal(conflict.json().rows[0].action, "REVIEW");
  await app.close();
});

test("photos above 15 MB require explicit confirmation before R2 configuration", async () => {
  const propertyId = "f48ab88b-b1cb-4adf-b930-3537767cfb92";
  const client: Record<string, any> = {
    session: { async findUnique() { return { id: "session-1", expiresAt: new Date(Date.now() + 60_000), user: { id: "user-1", name: "Admin", email: "admin@example.com", memberships: [{ role: "ADMIN", organization: { id: "org-1", name: "CRM", slug: "crm" } }] } }; } },
    property: { async findFirst() { return { id: propertyId }; } },
  };
  const app = await buildApp(config, { client, async ping() {}, async disconnect() {} } as unknown as DatabaseConnection);
  const sizeBytes = 16 * 1024 * 1024;
  const payload = { filename: "large.jpg", mimeType: "image/jpeg", sizeBytes };
  const blocked = await app.inject({ method: "POST", url: `/properties/${propertyId}/photos/prepare`, headers: cookie, payload });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.json().sizeBytes, sizeBytes);
  const confirmed = await app.inject({ method: "POST", url: `/properties/${propertyId}/photos/prepare`, headers: cookie, payload: { ...payload, confirmOversize: true } });
  assert.equal(confirmed.statusCode, 503);
  assert.equal(confirmed.json().error, "storage_not_configured");
  await app.close();
});
