import { createHash } from "node:crypto";
import type { PropertyImportRow, PropertyMappedImportRow } from "@estate-crm/contracts";

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

function enumValue<T extends string>(raw: string | undefined, aliases: Record<string, T>, fallback: T, warnings: string[], label: string) {
  const value = raw?.trim();
  if (!value) return fallback;
  const normalized = value.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
  const result = aliases[normalized];
  if (result) return result;
  warnings.push(`${label} «${value}» не распознано.`);
  return fallback;
}

const categoryAliases = {
  apartment: "APARTMENT", "квартира": "APARTMENT", "квартиры": "APARTMENT",
  house: "HOUSE", "дом": "HOUSE", "дома": "HOUSE", "коттедж": "HOUSE",
  land: "LAND", "земля": "LAND", "участок": "LAND",
  commercial: "COMMERCIAL", "коммерция": "COMMERCIAL", "коммерческая": "COMMERCIAL",
} as const;
const marketAliases = { primary: "PRIMARY", "новостройка": "PRIMARY", "первичный": "PRIMARY", secondary: "SECONDARY", "вторичка": "SECONDARY", "вторичный": "SECONDARY" } as const;
const operationAliases = { sale: "SALE", "продажа": "SALE", rent: "RENT", "аренда": "RENT" } as const;
const statusAliases = { available: "AVAILABLE", "доступен": "AVAILABLE", "доступна": "AVAILABLE", "актуален": "AVAILABLE", "актуальна": "AVAILABLE", reserved: "RESERVED", "резерв": "RESERVED", "забронирован": "RESERVED", sold: "SOLD", "продан": "SOLD", "продана": "SOLD", "снят": "SOLD", "снята": "SOLD" } as const;
const currencyAliases = { usd: "USD", "$": "USD", "доллар": "USD", "доллары": "USD", eur: "EUR", "€": "EUR", "евро": "EUR", uah: "UAH", "₴": "UAH", "грн": "UAH", "гривна": "UAH" } as const;

export function mappedSourceHash(row: PropertyMappedImportRow) {
  const values = Object.fromEntries(Object.entries(row.values).filter(([key]) => key !== "crmId").sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value?.trim() ?? ""]));
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export function adaptMappedImportRow(row: PropertyMappedImportRow) {
  const value = (key: keyof PropertyMappedImportRow["values"]) => row.values[key]?.trim() ?? "";
  const warnings: string[] = [];
  const category = enumValue(value("category"), categoryAliases, "APARTMENT", warnings, "Тип объекта");
  const market = enumValue(value("market"), marketAliases, "SECONDARY", warnings, "Рынок");
  const operation = enumValue(value("operation"), operationAliases, "SALE", warnings, "Операция");
  const status = enumValue(value("status"), statusAliases, "AVAILABLE", warnings, "Статус");
  const currency = enumValue(value("currency"), currencyAliases, "USD", warnings, "Валюта");
  const address = text(value("address"));
  const project = text(value("project"));
  const buildingLabel = text(value("buildingLabel"));
  const title = text(value("title")) ?? [category === "APARTMENT" ? "Квартира" : category === "HOUSE" ? "Дом" : category === "LAND" ? "Участок" : "Коммерция", address ?? project ?? buildingLabel ?? `строка ${row.rowNumber}`].join(" · ");
  const parseNumber = (key: keyof PropertyMappedImportRow["values"], label: string) => {
    const raw = value(key); if (!raw) return null;
    const parsed = moneyValue(raw.replace(/\s*(м²|м2|сот(?:ок|ки)?|этаж(?:а|ей)?)\s*$/i, ""));
    if (parsed === null) warnings.push(`${label} «${raw}» не распознано.`);
    return parsed;
  };
  const parseInteger = (key: keyof PropertyMappedImportRow["values"], label: string) => {
    const raw = value(key); if (!raw) return null;
    const parsed = intValue(raw);
    if (parsed === null) warnings.push(`${label} «${raw}» не распознано.`);
    return parsed;
  };
  const price = parseNumber("price", "Цена");
  const pricePerSquareMeter = parseNumber("pricePerSquareMeter", "Цена за м²");
  const area = parseNumber("area", "Площадь");
  if (!address && !project && !buildingLabel) warnings.push("Не указаны адрес или название проекта.");
  return { warnings, data: {
    title, address, district: text(value("district")), category, market, operation, status,
    price, pricePerSquareMeter, priceRaw: text(value("price")), currency,
    rooms: text(value("rooms")), area, areaRaw: text(value("area")),
    floor: parseInteger("floor", "Этаж"), totalFloors: parseInteger("totalFloors", "Этажность"),
    landArea: parseNumber("landArea", "Площадь участка"), project, developer: text(value("developer")),
    description: text(value("description")), buildingLabel, unitDetail: text(value("unitDetail")),
    subtype: text(value("subtype")), condition: text(value("condition")), documentNotes: text(value("documentNotes")),
    ownerName: text(value("ownerName")), ownerContacts: text(value("ownerContacts")), assignmentNote: text(value("assignmentNote")) ?? "Назначить ответственного",
    sourceSheet: row.sourceSheet, sourceRow: row.rowNumber, sourceHash: mappedSourceHash(row),
    sourceRaw: { mappedValues: row.values }, importedAt: new Date(),
  } };
}

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
