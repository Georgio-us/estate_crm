import type { ImportedDealRow } from "./PipelineDataTransfer";

const historicalMetaHeaders = [
  "created_time",
  "adset_name",
  "коли_плануєте_купівлю?",
  "чи_потрібна_вам_розстрочка?",
  "full_name",
  "phone_number",
  "estate_crm_sent_at",
] as const;

const purchaseTimingLabels: Record<string, string> = {
  "протягом_1-3_місяців": "Покупка в течение 1–3 месяцев",
  "протягом_3-6_місяців": "Покупка в течение 3–6 месяцев",
  "ще_не_визначилися": "Срок покупки ещё не определён",
};

const installmentLabels: Record<string, string> = {
  "так,_потрібна_розстрочка": "Нужна рассрочка",
  "ні,_планую_повну_оплату": "Рассрочка не нужна, планирует полную оплату",
};

function normalizedEntries(row: ImportedDealRow) {
  return new Map(Object.entries(row).map(([key, value]) => [key.trim().toLocaleLowerCase("uk-UA"), value.trim()]));
}

function sourceValue(row: ImportedDealRow, header: string): string {
  return normalizedEntries(row).get(header.toLocaleLowerCase("uk-UA")) || "";
}

function formatLeadDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value.trim();
}

function mappedAnswer(value: string, labels: Record<string, string>): string {
  return labels[value] || value.replaceAll("_", " ").trim();
}

function requestText(row: ImportedDealRow): string {
  const timing = mappedAnswer(sourceValue(row, "коли_плануєте_купівлю?"), purchaseTimingLabels);
  const installment = mappedAnswer(sourceValue(row, "чи_потрібна_вам_розстрочка?"), installmentLabels);
  return [timing, installment].filter(Boolean).map((part) => part.replace(/[.\s]+$/, "")).join(". ") + ".";
}

function isHistoricalMetaExport(rows: ImportedDealRow[]): boolean {
  if (!rows[0]) return false;
  const headers = new Set(Object.keys(rows[0]).map((key) => key.trim().toLocaleLowerCase("uk-UA")));
  return historicalMetaHeaders.every((header) => headers.has(header));
}

export interface PipelineImportMapping {
  rows: ImportedDealRow[];
  excluded: number;
  format: "pipeline" | "historical-meta";
}

export function mapPipelineImportRows(rows: ImportedDealRow[]): PipelineImportMapping {
  if (!isHistoricalMetaExport(rows)) return { rows, excluded: 0, format: "pipeline" };

  const firstSentIndex = rows.findIndex((row) => Boolean(sourceValue(row, "estate_crm_sent_at")));
  const historicalRows = firstSentIndex < 0 ? rows : rows.slice(0, firstSentIndex);
  const mappedRows = historicalRows.flatMap((row) => {
    const name = sourceValue(row, "full_name");
    const phone = sourceValue(row, "phone_number").replace(/^p:/i, "");
    const title = sourceValue(row, "adset_name");
    const createdTime = sourceValue(row, "created_time");
    const isTest = name.toLocaleLowerCase("en-US").includes("<test lead:") || phone.toLocaleLowerCase("en-US").includes("<test lead:");
    if (isTest || !name || !phone || !title) return [];

    return [{
      "Контакт": name,
      "Телефон": phone,
      "Название сделки": title,
      "Запрос": requestText(row),
      "Этап": "Лиды из таблицы",
      "Источник": "Meta",
      "Операция": "Покупка",
      "Комментарий": createdTime ? `Дата заявки: ${formatLeadDate(createdTime)}` : "",
    }];
  });

  return {
    rows: mappedRows,
    excluded: rows.length - mappedRows.length,
    format: "historical-meta",
  };
}
