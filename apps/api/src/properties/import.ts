import { createHash } from "node:crypto";
import type { PropertyImportRow } from "@estate-crm/contracts";

export const sourceHeaders: Record<"квартиры" | "дома" | "коммерция", string[]> = {
  квартиры: ["ЖК", "Адрес, секция, № кв.", "Кол-во комнат", "Этаж/Эт-сть", "м²", "Состояние", "Описание, документы", "Цена,$", "ФИО", "Контакты", "Риелтор"],
  дома: ["Район", "Адрес", "Обьект", "кол-во соток", "Этажность", "м²", "Состояние", "Описание", "Документы", "Цена,$", "ФИО", "Контакты", "Риелтор"],
  коммерция: ["ЖК", "Обьект", "Адрес, секция, №", "Этаж", "м²", "Состояние", "Описание, документы", "Цена,$", "ФИО", "Контакты", "Риелтор"],
};

export function sourceHash(row: PropertyImportRow) {
  return createHash("sha256").update(JSON.stringify([row.sheet, row.rowNumber, row.operation ?? "SALE", row.cells.map((cell) => cell.trim())])).digest("hex");
}

function numberValue(raw: string) {
  const normalized = raw.replace(/\s/g, "").replace(/,/g, ".");
  if (!normalized || !/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function pricePerSquareMeterValue(raw: string) {
  const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*\/\s*м(?:2|²)$/i);
  return match?.[1] ? numberValue(match[1]) : null;
}

function moneyValue(raw: string) {
  return numberValue(raw.replace(/^\s*[$€₴]\s*|\s*[$€₴]\s*$/g, ""));
}

function intValue(raw: string) {
  const value = Number(raw.trim());
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function text(raw: string) { return raw.trim() || null; }

function commercialOperations(row: PropertyImportRow): Array<"SALE" | "RENT"> {
  if (row.operation) return [row.operation];
  if (row.sheet !== "коммерция") return ["SALE"];
  const label = row.cells[1]?.trim().toLowerCase() ?? "";
  const sale = label.includes("продаж");
  const rent = label.includes("аренд");
  if (sale && rent) return ["SALE", "RENT"];
  if (rent) return ["RENT"];
  return ["SALE"];
}

export function expandImportRows(rows: PropertyImportRow[]) {
  return rows.flatMap((row) => commercialOperations(row).map((operation) => ({ ...row, operation })));
}

function commercialPrice(cells: string[], operation: "SALE" | "RENT") {
  const source = text(cells[7] ?? "");
  const label = (cells[1] ?? "").toLowerCase();
  const mixed = label.includes("продаж") && label.includes("аренд");
  if (mixed && source?.includes("/")) {
    const parts = source.split("/").map((part) => part.trim());
    return { raw: operation === "RENT" ? parts[0] ?? "" : parts.at(-1) ?? "", currency: "USD" as const };
  }
  if (operation === "RENT" && mixed) {
    const description = cells[6] ?? "";
    const match = description.match(/аренд[а-яё]*\s*(?:[-–—:]\s*)?(\d[\d\s.,]*)\s*(грн|uah|₴|у\.?\s*е\.?)?/i);
    if (match?.[1]) return { raw: match[1].trim(), currency: /грн|uah|₴/i.test(match[2] ?? "") ? "UAH" as const : "USD" as const };
  }
  return { raw: source ?? "", currency: "USD" as const };
}

export function adaptImportRow(row: PropertyImportRow) {
  const c = row.cells.map((value) => value.trim());
  const warnings: string[] = [];
  if (row.sheet === "аренда") return { data: null, warnings: ["Лист аренды пока не импортируется."] };
  const operation = row.operation ?? commercialOperations(row)[0] ?? "SALE";
  const house = row.sheet === "дома";
  const address = text(c[house ? 1 : row.sheet === "коммерция" ? 2 : 1] ?? "");
  if (!address) warnings.push("Адрес не указан.");
  const subtype = house ? text(c[2] ?? "") : row.sheet === "коммерция" ? text(c[1] ?? "") : null;
  const category: "LAND" | "HOUSE" | "COMMERCIAL" | "APARTMENT" = house ? (/участ|земл/i.test(subtype ?? "") ? "LAND" : "HOUSE") : row.sheet === "коммерция" ? "COMMERCIAL" : "APARTMENT";
  const parsedPrice = row.sheet === "коммерция" ? commercialPrice(c, operation) : { raw: text(c[house ? 9 : 7] ?? "") ?? "", currency: "USD" as const };
  const priceRaw = text(parsedPrice.raw);
  const areaRaw = text(c[house ? 5 : 4] ?? "");
  const area = numberValue(areaRaw ?? "");
  const pricePerSquareMeter = pricePerSquareMeterValue(priceRaw ?? "");
  const price = moneyValue(priceRaw ?? "") ?? (pricePerSquareMeter !== null && area !== null ? Math.round(pricePerSquareMeter * area * 100) / 100 : null);
  if (priceRaw && price === null) warnings.push(`Цену «${priceRaw}» нужно проверить вручную.`);
  if (areaRaw && area === null) warnings.push(`Площадь «${areaRaw}» нужно проверить вручную.`);
  if (row.sheet === "коммерция" && area !== null && area <= 10) warnings.push(`Площадь ${area} м² выглядит необычно для коммерческого объекта. Сверьте её с источником.`);
  const floorRaw = c[house ? 4 : row.sheet === "коммерция" ? 3 : 3] ?? "";
  const floorParts = floorRaw.split(/\s*[/\\]\s*/);
  const sourceRealtor = text(c[house ? 12 : 10] ?? "");
  const buildingLabel = house ? null : text(c[0] ?? "");
  const ownerName = text(c[house ? 10 : 8] ?? "");
  const ownerContacts = text(c[house ? 11 : 9] ?? "");
  const title = [category === "APARTMENT" ? "Квартира" : category === "COMMERCIAL" ? "Коммерция" : category === "LAND" ? "Участок" : "Дом", address ?? buildingLabel ?? `строка ${row.rowNumber}`].join(" · ");
  return { warnings, data: {
    title, address, district: house ? text(c[0] ?? "") : null, category, market: "SECONDARY" as const,
    operation, status: "AVAILABLE" as const, currency: parsedPrice.currency,
    price, pricePerSquareMeter, priceRaw, area, areaRaw, rooms: house ? null : row.sheet === "квартиры" ? text(c[2] ?? "") : null,
    floor: house ? null : intValue(floorParts[0] ?? ""), totalFloors: house ? intValue(floorRaw) : intValue(floorParts[1] ?? ""),
    landArea: house ? numberValue(c[3] ?? "") : null, project: buildingLabel,
    buildingLabel, unitDetail: row.sheet === "квартиры" ? address : null, subtype,
    condition: text(c[house ? 6 : 5] ?? ""), description: text(c[house ? 7 : 6] ?? ""),
    documentNotes: house ? text(c[8] ?? "") : null, ownerName, ownerContacts,
    assignmentNote: sourceRealtor ? `Назначить ответственного (${sourceRealtor})` : "Назначить ответственного",
    sourceSheet: row.sheet, sourceRow: row.rowNumber, sourceHash: sourceHash(row),
    sourceRaw: { cells: row.cells, realtor: sourceRealtor, extraCells: row.cells.slice(sourceHeaders[row.sheet].length) },
    importedAt: new Date(),
  } };
}

export const importedFieldNames = ["title", "address", "district", "category", "price", "pricePerSquareMeter", "priceRaw", "area", "areaRaw", "rooms", "floor", "totalFloors", "landArea", "project", "buildingLabel", "unitDetail", "subtype", "condition", "description", "documentNotes", "ownerName", "ownerContacts", "assignmentNote"] as const;

export function sourceChanges(row: PropertyImportRow, previousCells: string[]) {
  const previous = adaptImportRow({ ...row, cells: previousCells }).data as Record<string, unknown> | null;
  const next = adaptImportRow(row).data as Record<string, unknown> | null;
  if (!previous || !next) return [];
  return importedFieldNames.filter((name) => JSON.stringify(previous[name]) !== JSON.stringify(next[name])).map((name) => ({ name, before: previous[name], after: next[name] }));
}
