"use client";

import { useRef, useState } from "react";
import styles from "./properties.module.css";

type PropertyMappedImportField = "crmId" | "title" | "address" | "district" | "category" | "market" | "operation" | "status" | "price" | "pricePerSquareMeter" | "currency" | "rooms" | "area" | "floor" | "totalFloors" | "landArea" | "project" | "developer" | "description" | "buildingLabel" | "unitDetail" | "subtype" | "condition" | "documentNotes" | "ownerName" | "ownerContacts" | "assignmentNote";
type PropertyMappedImportRow = { rowNumber: number; sourceSheet: string; values: Partial<Record<PropertyMappedImportField, string>> };
type PropertyMappedImportPreviewResponse = { rows: Array<{ rowNumber: number; title: string; category: string; operation: string; action: "CREATE" | "UPDATE" | "SKIP" | "REVIEW"; warnings: string[]; existingId: string | null }>; counts: { create: number; update: number; skip: number; review: number } };
type ParsedSheet = { name: string; headers: string[]; rows: string[][] };
type Mapping = Record<number, PropertyMappedImportField | "">;
type Defaults = { category: string; market: string; operation: string; status: string; currency: string };

const fields: Array<{ value: PropertyMappedImportField; label: string }> = [
  { value: "crmId", label: "CRM ID (для обновления)" }, { value: "title", label: "Название" },
  { value: "category", label: "Тип объекта" }, { value: "market", label: "Рынок" },
  { value: "operation", label: "Операция" }, { value: "status", label: "Статус" },
  { value: "address", label: "Адрес" }, { value: "district", label: "Район" },
  { value: "price", label: "Цена" }, { value: "currency", label: "Валюта" },
  { value: "pricePerSquareMeter", label: "Цена за м²" }, { value: "rooms", label: "Комнаты" },
  { value: "area", label: "Площадь, м²" }, { value: "floor", label: "Этаж" },
  { value: "totalFloors", label: "Этажность" }, { value: "landArea", label: "Площадь участка" },
  { value: "project", label: "ЖК / проект" }, { value: "developer", label: "Застройщик" },
  { value: "buildingLabel", label: "Корпус / дом" }, { value: "unitDetail", label: "Секция / № квартиры" },
  { value: "subtype", label: "Подтип объекта" }, { value: "condition", label: "Состояние" },
  { value: "description", label: "Описание" }, { value: "documentNotes", label: "Документы" },
  { value: "ownerName", label: "Имя собственника" }, { value: "ownerContacts", label: "Контакты собственника" },
  { value: "assignmentNote", label: "Комментарий назначения" },
];

const aliases: Record<string, PropertyMappedImportField> = {
  "crm id": "crmId", "id crm": "crmId", "ид crm": "crmId", "название": "title", "объект": "title", "обьект": "title",
  "тип объекта": "category", "категория": "category", "рынок": "market", "операция": "operation", "статус": "status",
  "адрес": "address", "адрес секция № кв": "address", "район": "district", "цена": "price", "цена $": "price",
  "валюта": "currency", "цена за м²": "pricePerSquareMeter", "цена за м2": "pricePerSquareMeter",
  "комнаты": "rooms", "кол во комнат": "rooms", "площадь": "area", "площадь м²": "area", "м²": "area", "м2": "area",
  "этаж": "floor", "этажность": "totalFloors", "этаж эт сть": "totalFloors", "площадь участка": "landArea", "кол во соток": "landArea",
  "жк": "project", "жк проект": "project", "проект": "project", "застройщик": "developer", "корпус": "buildingLabel",
  "секция № квартиры": "unitDetail", "подтип": "subtype", "состояние": "condition", "описание": "description",
  "описание документы": "description", "документы": "documentNotes", "фио": "ownerName", "имя собственника": "ownerName",
  "контакты": "ownerContacts", "контакты собственника": "ownerContacts", "комментарий назначения": "assignmentNote",
  "title": "title", "type": "category", "category": "category", "market": "market", "operation": "operation", "status": "status",
  "address": "address", "district": "district", "price": "price", "currency": "currency", "rooms": "rooms", "area": "area",
  "floor": "floor", "total floors": "totalFloors", "land area": "landArea", "project": "project", "developer": "developer",
  "description": "description", "condition": "condition", "owner name": "ownerName", "owner contacts": "ownerContacts",
};

function normalizeHeader(value: string) { return value.trim().toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[.,()_\-/]+/g, " ").replace(/\s+/g, " "); }
function csvSafe(value: string) { return /^[=+\-@]/.test(value) ? `'${value}` : value; }
function dateSuffix() { return new Date().toISOString().slice(0, 10); }

export function PropertyExcelTransfer({ onImported, canExport = true }: { onImported: () => Promise<void>; canExport?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [defaults, setDefaults] = useState<Defaults>({ category: "APARTMENT", market: "SECONDARY", operation: "SALE", status: "AVAILABLE", currency: "USD" });
  const [preview, setPreview] = useState<PropertyMappedImportPreviewResponse | null>(null);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  const sheet = sheets[sheetIndex];

  function makeMapping(headers: string[]) {
    const used = new Set<PropertyMappedImportField>();
    return Object.fromEntries(headers.map((header, index) => { const suggestion = aliases[normalizeHeader(header)]; if (!suggestion || used.has(suggestion)) return [index, ""]; used.add(suggestion); return [index, suggestion]; })) as Mapping;
  }

  function closeWizard() { setSheets([]); setPreview(null); setConfirmed([]); setFileName(""); setMessage(""); }

  async function readFile(file: File) {
    setBusy(true); setMessage("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("Файл больше 20 МБ. Разделите его на части.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed = workbook.SheetNames.flatMap((name) => {
        const worksheet = workbook.Sheets[name]; if (!worksheet) return [];
        const values = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: false, blankrows: false });
        const headers = (values[0] ?? []).map((cell, index) => String(cell ?? "").trim() || `Колонка ${index + 1}`);
        const rows = values.slice(1).map((row) => headers.map((_, index) => String(row[index] ?? ""))).filter((row) => row.some((cell) => cell.trim()));
        return headers.length && rows.length ? [{ name, headers, rows }] : [];
      });
      if (!parsed.length) throw new Error("В файле нет таблицы с заголовками и строками данных.");
      setFileName(file.name); setSheets(parsed); setSheetIndex(0); setMapping(makeMapping(parsed[0]?.headers ?? [])); setPreview(null); setConfirmed([]);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось открыть файл."); }
    finally { setBusy(false); }
  }

  function mappedRows(): PropertyMappedImportRow[] {
    if (!sheet) return [];
    return sheet.rows.slice(0, 500).map((cells, index) => {
      const values: PropertyMappedImportRow["values"] = { ...defaults };
      for (const [column, field] of Object.entries(mapping)) {
        if (!field) continue;
        const cell = cells[Number(column)]?.trim();
        if (cell) values[field] = cell;
      }
      return { rowNumber: index + 2, sourceSheet: `${fileName} · ${sheet.name}`.slice(0, 300), values };
    });
  }

  async function createPreview() {
    const rows = mappedRows();
    if (!Object.values(mapping).some(Boolean)) { setMessage("Сопоставьте хотя бы одну колонку файла с полем CRM."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/crm/properties/import/mapped/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows }) });
      const result = await response.json() as PropertyMappedImportPreviewResponse & { message?: string };
      if (!response.ok || !result.rows) throw new Error(result.message || "Не удалось проверить файл.");
      setPreview(result); setConfirmed([]);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось проверить файл."); }
    finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/crm/properties/import/mapped/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: mappedRows(), confirmedRows: confirmed }) });
      const result = await response.json() as { created?: number; updated?: number; skipped?: number; message?: string };
      if (!response.ok) throw new Error(result.message || "Импорт не удался.");
      const success = `Готово: добавлено ${result.created ?? 0}, обновлено ${result.updated ?? 0}, без изменений ${result.skipped ?? 0}.`;
      closeWizard(); setMessage(success); await onImported();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Импорт не удался."); }
    finally { setBusy(false); }
  }

  async function exportFile() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/crm/properties/export", { cache: "no-store" });
      const result = await response.json() as { sheets?: Record<string, string[][]>; message?: string };
      if (!response.ok || !result.sheets) throw new Error(result.message || "Не удалось выгрузить объекты.");
      const XLSX = await import("xlsx"); const workbook = XLSX.utils.book_new();
      for (const [name, values] of Object.entries(result.sheets)) {
        const worksheet = XLSX.utils.aoa_to_sheet(values.map((row) => row.map((cell) => csvSafe(String(cell ?? "")))));
        worksheet["!cols"] = values[0]?.map((header) => ({ wch: Math.min(42, Math.max(12, String(header).length + 3)) }));
        XLSX.utils.book_append_sheet(workbook, worksheet, name);
      }
      XLSX.writeFileXLSX(workbook, `objects-${dateSuffix()}.xlsx`, { compression: true });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Экспорт не удался."); }
    finally { setBusy(false); }
  }

  const warningsConfirmed = preview?.rows.every((row) => !row.warnings.length || confirmed.includes(row.rowNumber)) ?? false;
  return <div className={styles.propertyExcelTransfer}>
    <button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>Импорт таблицы</button>
    <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} />
    {canExport && <button type="button" disabled={busy} onClick={() => { void exportFile(); }}>Экспорт Excel</button>}
    {message && <p role="status">{message}</p>}
    {sheet && <div className={styles.importWizardLayer} role="dialog" aria-modal="true" aria-labelledby="property-import-title">
      <div className={styles.importWizard}>
        <header><div><span>ИМПОРТ ОБЪЕКТОВ</span><h2 id="property-import-title">{preview ? "Проверка перед импортом" : "Сопоставьте колонки"}</h2><p>{fileName}</p></div><button type="button" aria-label="Закрыть" onClick={closeWizard}>×</button></header>
        {!preview ? <div className={styles.importWizardBody}>
          {sheets.length > 1 && <label className={styles.importSheetSelect}>Лист<select value={sheetIndex} onChange={(event) => { const next = Number(event.target.value); setSheetIndex(next); setMapping(makeMapping(sheets[next]?.headers ?? [])); }}>
            {sheets.map((item, index) => <option value={index} key={item.name}>{item.name} · {item.rows.length} строк</option>)}</select></label>}
          <div className={styles.importDefaults}><label>Если в файле нет типа<select value={defaults.category} onChange={(event) => setDefaults((current) => ({ ...current, category: event.target.value }))}><option value="APARTMENT">Квартира</option><option value="HOUSE">Дом</option><option value="LAND">Участок</option><option value="COMMERCIAL">Коммерция</option></select></label><label>Рынок<select value={defaults.market} onChange={(event) => setDefaults((current) => ({ ...current, market: event.target.value }))}><option value="SECONDARY">Вторичный</option><option value="PRIMARY">Первичный</option></select></label><label>Операция<select value={defaults.operation} onChange={(event) => setDefaults((current) => ({ ...current, operation: event.target.value }))}><option value="SALE">Продажа</option><option value="RENT">Аренда</option></select></label><label>Валюта<select value={defaults.currency} onChange={(event) => setDefaults((current) => ({ ...current, currency: event.target.value }))}><option value="USD">USD</option><option value="EUR">EUR</option><option value="UAH">UAH</option></select></label></div>
          {sheet.rows.length > 500 && <div className={styles.importNotice}>В файле {sheet.rows.length} строк. За один импорт будут обработаны первые 500.</div>}
          <div className={styles.importMappingTable}><div className={styles.importMappingHead}><span>Колонка в файле</span><span>Пример</span><span>Поле в CRM</span></div>{sheet.headers.map((header, index) => <div className={styles.importMappingRow} key={`${header}:${index}`}><strong>{header}</strong><span title={sheet.rows[0]?.[index]}>{sheet.rows[0]?.[index] || "—"}</span><select value={mapping[index] ?? ""} onChange={(event) => { const next = event.target.value as PropertyMappedImportField | ""; setMapping((current) => ({ ...Object.fromEntries(Object.entries(current).map(([key, value]) => value === next && Number(key) !== index ? [key, ""] : [key, value])), [index]: next })); }}><option value="">Не импортировать</option>{fields.map((field) => <option value={field.value} key={field.value}>{field.label}</option>)}</select></div>)}</div>
        </div> : <div className={styles.importWizardBody}>
          <div className={styles.importSummary}><div><strong>{preview.counts.create}</strong><span>новых</span></div><div><strong>{preview.counts.update}</strong><span>обновлений</span></div><div><strong>{preview.counts.skip}</strong><span>без изменений</span></div><div className={preview.counts.review ? styles.importSummaryDanger : ""}><strong>{preview.counts.review}</strong><span>требуют решения</span></div></div>
          <div className={styles.importPreviewRows}>{preview.rows.map((row) => <article key={row.rowNumber}><div><strong>Строка {row.rowNumber} · {row.title}</strong><span>{row.action === "CREATE" ? "Будет создан" : row.action === "UPDATE" ? "Будет обновлён" : row.action === "SKIP" ? "Без изменений" : "Нужно исправить"}</span></div>{row.warnings.length > 0 && <label><input type="checkbox" checked={confirmed.includes(row.rowNumber)} disabled={row.action === "REVIEW"} onChange={(event) => setConfirmed((current) => event.target.checked ? [...current, row.rowNumber] : current.filter((number) => number !== row.rowNumber))} /><span>{row.warnings.join(" ")}</span></label>}</article>)}</div>
        </div>}
        <footer><button type="button" onClick={preview ? () => { setPreview(null); setConfirmed([]); } : closeWizard}>{preview ? "Назад к сопоставлению" : "Отмена"}</button>{!preview ? <button className={styles.importPrimaryAction} type="button" disabled={busy} onClick={() => { void createPreview(); }}>{busy ? "Проверяем…" : `Проверить ${Math.min(sheet.rows.length, 500)} строк`}</button> : <button className={styles.importPrimaryAction} type="button" disabled={busy || preview.counts.review > 0 || !warningsConfirmed} onClick={() => { void apply(); }}>{busy ? "Импортируем…" : "Импортировать"}</button>}</footer>
      </div>
    </div>}
  </div>;
}
