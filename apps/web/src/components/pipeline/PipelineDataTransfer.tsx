"use client";

import { useRef, useState } from "react";
import styles from "./pipeline.module.css";

export type ImportedDealRow = Record<string, string>;

interface PipelineDataTransferProps {
  rows: string[][];
  viewLabel: string;
  onImport: (rows: ImportedDealRow[]) => Promise<{ created: number; updated: number; skipped: number; errors: string[] }>;
  onClose: () => void;
}

function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function csvCell(value: string) {
  const safe = /^[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function dateSuffix() {
  return new Date().toISOString().slice(0, 10);
}

export function PipelineDataTransfer({ rows, viewLabel, onImport, onClose }: PipelineDataTransferProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [accept, setAccept] = useState(".csv,text/csv");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  function exportCsv() {
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `deals-${dateSuffix()}.csv`);
  }

  async function exportXlsx() {
    setBusy(true);
    setResult("");
    try {
      const XLSX = await import("xlsx");
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet["!cols"] = rows[0]?.map((_, column) => ({ wch: Math.min(42, Math.max(12, ...rows.map((row) => String(row[column] || "").length + 2))) })) || [];
      if (rows.length) sheet["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col((rows[0]?.length || 1) - 1)}${rows.length}` };
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Сделки");
      XLSX.writeFileXLSX(workbook, `deals-${dateSuffix()}.xlsx`, { compression: true });
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(format: "csv" | "xlsx") {
    setAccept(format === "csv" ? ".csv,text/csv" : ".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel");
    window.setTimeout(() => inputRef.current?.click(), 0);
  }

  async function importFile(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setResult("Файл больше 10 МБ. Разделите его на несколько частей.");
      return;
    }
    setBusy(true);
    setResult("Читаем файл…");
    setErrors([]);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) throw new Error("В файле нет листов с данными.");
      const sheet = workbook.Sheets[firstSheet];
      if (!sheet) throw new Error("Не удалось прочитать первый лист.");
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
      if (!parsed.length) throw new Error("В файле нет строк для импорта.");
      if (parsed.length > 2_000) throw new Error("За один раз можно импортировать не более 2000 строк.");
      const normalized = parsed.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? "").trim()])));
      setResult(`Импортируем ${normalized.length} строк…`);
      const summary = await onImport(normalized);
      setErrors(summary.errors.slice(0, 8));
      setResult(`Готово: создано ${summary.created}, обновлено ${summary.updated}, пропущено ${summary.skipped}.`);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Не удалось импортировать файл.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return <div className={styles.transferLayer}>
    <button className={styles.transferBackdrop} type="button" aria-label="Закрыть импорт и экспорт" onClick={onClose} />
    <section className={styles.transferModal} role="dialog" aria-modal="true" aria-labelledby="pipeline-transfer-title">
      <header><div><span>Данные воронки</span><h3 id="pipeline-transfer-title">Импорт и экспорт</h3><p>{viewLabel}</p></div><button type="button" aria-label="Закрыть" onClick={onClose}>×</button></header>
      <div className={styles.transferSection}><div><strong>Экспортировать</strong><span>Скачать сделки с техническими ID для безопасного обратного импорта.</span></div><div className={styles.transferActions}><button type="button" disabled={busy} onClick={exportCsv}><b>CSV</b><span>Обычная таблица</span></button><button type="button" disabled={busy} onClick={() => { void exportXlsx(); }}><b>Excel</b><span>Файл .xlsx</span></button></div></div>
      <div className={styles.transferSection}><div><strong>Импортировать</strong><span>Первая строка должна содержать названия колонок. Можно использовать экспортированный файл как шаблон.</span></div><div className={styles.transferActions}><button type="button" disabled={busy} onClick={() => chooseFile("csv")}><b>CSV</b><span>Выбрать файл</span></button><button type="button" disabled={busy} onClick={() => chooseFile("xlsx")}><b>Excel</b><span>.xlsx или .xls</span></button></div><input ref={inputRef} className={styles.hiddenFileInput} type="file" accept={accept} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} /></div>
      {(result || errors.length > 0) && <footer className={styles.transferResult} aria-live="polite"><strong>{result}</strong>{errors.map((error) => <span key={error}>{error}</span>)}</footer>}
    </section>
  </div>;
}
