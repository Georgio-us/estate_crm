"use client";

import { useState } from "react";
import styles from "./properties.module.css";
type PropertyImportRow = { sheet: "квартиры" | "дома" | "коммерция" | "аренда"; rowNumber: number; cells: string[]; headers: string[]; crmId?: string | null };
type PreviewRow = { sheet: PropertyImportRow["sheet"]; rowNumber: number; title: string; action: "CREATE" | "UPDATE" | "SKIP" | "REVIEW"; warnings: string[] };
type PropertyImportPreviewResponse = { rows: PreviewRow[]; counts: { create: number; update: number; skip: number; review: number } };

const supported = ["квартиры", "дома", "коммерция"] as const;
const sourceColumnCount = { квартиры: 11, дома: 13, коммерция: 11 };

export function PropertyExcelTransfer({ onImported }: { onImported: () => Promise<void> }) {
  const [rows, setRows] = useState<PropertyImportRow[]>([]);
  const [preview, setPreview] = useState<PropertyImportPreviewResponse | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function readFile(file: File) {
    setBusy(true); setMessage(""); setPreview(null);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Excel-файл больше 10 МБ. Разделите его на части.");
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed: PropertyImportRow[] = [];
      for (const sheetName of supported) {
        const actualName = workbook.SheetNames.find((name) => name.toLocaleLowerCase("ru").trim() === sheetName);
        if (!actualName) continue;
        const sheet = workbook.Sheets[actualName]; if (!sheet) continue;
        const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
        const header = (values[0] ?? []).map(String);
        const idColumn = header.findIndex((value) => value.trim().toLocaleLowerCase("ru") === "crm id");
        values.slice(1).forEach((value, index) => {
          const cells = value.map((cell) => String(cell ?? ""));
          if (!cells.some((cell) => cell.trim())) return;
          const crmId = idColumn >= 0 ? cells[idColumn]?.trim() || null : null;
          const sourceCells = cells.slice(0, idColumn >= 0 ? idColumn : 30);
          while (sourceCells.length > sourceColumnCount[sheetName] && !sourceCells[sourceCells.length - 1]?.trim()) sourceCells.pop();
          parsed.push({ sheet: sheetName, rowNumber: index + 2, cells: sourceCells, headers: header, ...(crmId ? { crmId } : {}) });
        });
      }
      if (!parsed.length) throw new Error("Не найдены строки листов «квартиры», «дома» или «коммерция».");
      if (parsed.length > 500) throw new Error("За один раз можно импортировать до 500 строк.");
      const response = await fetch("/api/crm/properties/import/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: parsed }) });
      const result = await response.json() as PropertyImportPreviewResponse & { message?: string };
      if (!response.ok || !result.rows) throw new Error(result.message || "Не удалось проверить файл.");
      setRows(parsed); setPreview(result); setConfirmed([]);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Не удалось открыть Excel-файл."); }
    finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/crm/properties/import/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows, confirmedRows: confirmed }) });
      const result = await response.json() as { created?: number; updated?: number; message?: string };
      if (!response.ok) throw new Error(result.message || "Импорт не удался.");
      setMessage(`Импортировано: ${result.created ?? 0}, обновлено: ${result.updated ?? 0}.`);
      setPreview(null); setRows([]); await onImported();
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
        // Keep user-entered text as text, including strings that begin with Excel formula characters.
        const sheet = XLSX.utils.aoa_to_sheet(values.map((row) => row.map((cell) => String(cell ?? ""))));
        XLSX.utils.book_append_sheet(workbook, sheet, name);
      }
      XLSX.writeFileXLSX(workbook, `secondary-properties-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Экспорт не удался."); }
    finally { setBusy(false); }
  }

  return <div className={styles.propertyExcelTransfer}>
    <label className={styles.propertyExcelButton}>Импорт Excel<input type="file" accept=".xlsx,.xls" hidden disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} /></label>
    <button type="button" disabled={busy} onClick={() => { void exportFile(); }}>Экспорт Excel</button>
    {message && <p role="status">{message}</p>}
    {preview && <div className={styles.propertyExcelPreview}><strong>Проверка: {preview.counts.create} новых, {preview.counts.update} обновлений, {preview.counts.skip} пропущено, {preview.counts.review} требуют решения</strong>
      <div className={styles.propertyExcelRows}>{preview.rows.map((row) => <div key={`${row.sheet}-${row.rowNumber}`}><span>{row.sheet} · {row.rowNumber} · {row.title} · {row.action}</span>{row.warnings.length > 0 && <label><input type="checkbox" checked={confirmed.includes(`${row.sheet}:${row.rowNumber}`)} onChange={(event) => setConfirmed((current) => event.target.checked ? [...current, `${row.sheet}:${row.rowNumber}`] : current.filter((key) => key !== `${row.sheet}:${row.rowNumber}`))} /> Подтверждаю: {row.warnings.join(" ")}</label>}</div>)}</div>
      <button type="button" disabled={busy || preview.counts.review > 0 || preview.rows.some((row) => (row.action === "CREATE" || row.action === "UPDATE") && row.warnings.length && !confirmed.includes(`${row.sheet}:${row.rowNumber}`))} onClick={() => { void apply(); }}>Применить импорт</button>
    </div>}
  </div>;
}
