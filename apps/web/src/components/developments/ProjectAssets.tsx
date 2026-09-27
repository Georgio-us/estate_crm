"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DevelopmentAssetKind, DevelopmentAssetRecord } from "@/types/developments";

import styles from "./developments.module.css";

const kindLabels: Record<DevelopmentAssetKind, string> = {
  COVER: "Обложка", GALLERY: "Фотография", CHESSBOARD: "Шахматка", PRICE_LIST: "Прайс",
  LAYOUT: "Планировка", PROMOTION: "Акция", PRESENTATION: "Презентация", PERMIT: "Документы", OTHER: "Другое",
};
const statusLabels = { PENDING: "Загружается", READY: "Готов", PROCESSING: "Обрабатывается", REVIEW_REQUIRED: "Нужно проверить", FAILED: "Ошибка" } as const;

export function ProjectAssets({ projectId, onCoverChange }: { projectId: string; onCoverChange?: (url: string | null) => void }) {
  const [assets, setAssets] = useState<DevelopmentAssetRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [documentKind, setDocumentKind] = useState<DevelopmentAssetKind>("CHESSBOARD");
  const photoInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const response = await fetch(`/api/crm/development-projects/${projectId}/assets`, { cache: "no-store" });
      const payload = await response.json() as { assets?: DevelopmentAssetRecord[] };
      if (!response.ok || !payload.assets) throw new Error();
      setAssets(payload.assets); setState("ready");
      onCoverChange?.(payload.assets.find((item) => item.isCover)?.url ?? null);
    } catch { setState("error"); }
  }
  useEffect(() => {
    let active = true;
    void fetch(`/api/crm/development-projects/${projectId}/assets`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { assets?: DevelopmentAssetRecord[] };
      if (!response.ok || !payload.assets) throw new Error();
      if (active) { setAssets(payload.assets); setState("ready"); onCoverChange?.(payload.assets.find((item) => item.isCover)?.url ?? null); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [onCoverChange, projectId]);

  const images = useMemo(() => assets.filter((asset) => asset.mimeType.startsWith("image/")), [assets]);
  const documents = useMemo(() => assets.filter((asset) => !asset.mimeType.startsWith("image/")), [assets]);

  async function uploadFile(file: File, kind: DevelopmentAssetKind) {
    const prepared = await fetch(`/api/crm/development-projects/${projectId}/assets/prepare`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ filename: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, kind }),
    });
    const payload = await prepared.json() as { assetId?: string; uploadUrl?: string; message?: string };
    if (!prepared.ok || !payload.assetId || !payload.uploadUrl) throw new Error(payload.message || "Не удалось подготовить загрузку.");
    const upload = await fetch(payload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    if (!upload.ok) throw new Error("R2 не принял файл. Проверьте формат или CORS хранилища.");
    const finalized = await fetch(`/api/crm/development-projects/${projectId}/assets/${payload.assetId}/finalize`, { method: "POST" });
    const finalizedPayload = await finalized.json() as { message?: string };
    if (!finalized.ok) throw new Error(finalizedPayload.message || "Не удалось завершить загрузку.");
  }

  async function uploadFiles(files: File[], kind: DevelopmentAssetKind) {
    setUploading(true); setError("");
    try {
      for (let index = 0; index < files.length; index += 1) {
        setProgress(`Загружаем ${index + 1} из ${files.length}`);
        await uploadFile(files[index]!, kind);
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить файл."); }
    finally { setUploading(false); setProgress(""); }
  }

  async function updateAsset(assetId: string, body: { isCover?: boolean; reviewed?: boolean }) {
    setError("");
    const response = await fetch(`/api/crm/development-projects/${projectId}/assets/${assetId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) { const payload = await response.json() as { message?: string }; setError(payload.message || "Не удалось обновить файл."); return; }
    await load();
  }

  async function removeAsset(asset: DevelopmentAssetRecord) {
    if (!window.confirm(`Удалить «${asset.filename}» из проекта и хранилища?`)) return;
    const response = await fetch(`/api/crm/development-projects/${projectId}/assets/${asset.id}`, { method: "DELETE" });
    if (!response.ok) { setError("Не удалось удалить файл."); return; }
    await load();
  }

  return <section className={styles.assetsSection}>
    <header><div><span className={styles.sectionEyebrow}>Материалы проекта</span><h2>Фотографии и документы</h2><p>Файлы хранятся в закрытом Cloudflare R2 и доступны только сотрудникам CRM.</p></div></header>
    {error && <p className={styles.assetError}>{error}</p>}
    <div className={styles.assetBlock}>
      <div className={styles.assetBlockHeader}><div><h3>Обложка и галерея</h3><p>JPG, PNG, WebP, AVIF или HEIC, до 25 МБ на файл.</p></div><input ref={photoInput} hidden multiple type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void uploadFiles(files, "GALLERY"); event.target.value = ""; }} /><button type="button" disabled={uploading} onClick={() => photoInput.current?.click()}>{uploading ? progress : "＋ Добавить фотографии"}</button></div>
      {state === "loading" ? <div className={styles.assetEmpty}>Загружаем материалы…</div> : state === "error" ? <div className={styles.assetEmpty}>Не удалось загрузить материалы.</div> : images.length ? <div className={styles.assetGallery}>{images.map((asset) => <article className={styles.assetPhoto} key={asset.id}><a href={asset.url} target="_blank" rel="noreferrer" style={{ backgroundImage: `url("${asset.url}")` }} aria-label={`Открыть ${asset.filename}`} />{asset.isCover && <span>Обложка</span>}<footer><small title={asset.filename}>{asset.filename}</small><div>{!asset.isCover && <button type="button" onClick={() => { void updateAsset(asset.id, { isCover: true }); }}>На обложку</button>}<button className={styles.dangerAction} type="button" onClick={() => { void removeAsset(asset); }}>Удалить</button></div></footer></article>)}</div> : <div className={styles.assetEmpty}>Фотографии ещё не добавлены.</div>}
    </div>
    <div className={styles.assetBlock}>
      <div className={styles.assetBlockHeader}><div><h3>Документы</h3><p>PDF, Excel и Word до 100 МБ. Шахматка и прайс получают отдельный черновик импорта.</p></div><div className={styles.documentUpload}><select value={documentKind} onChange={(event) => setDocumentKind(event.target.value as DevelopmentAssetKind)}>{(["CHESSBOARD", "PRICE_LIST", "LAYOUT", "PROMOTION", "PRESENTATION", "PERMIT", "OTHER"] as DevelopmentAssetKind[]).map((kind) => <option value={kind} key={kind}>{kindLabels[kind]}</option>)}</select><input ref={documentInput} hidden type="file" accept="application/pdf,.pdf,.xlsx,.xls,.doc,.docx" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void uploadFiles(files, documentKind); event.target.value = ""; }} /><button type="button" disabled={uploading} onClick={() => documentInput.current?.click()}>{uploading ? progress : "＋ Загрузить файл"}</button></div></div>
      {documents.length ? <div className={styles.documentList}>{documents.map((asset) => <article key={asset.id}><div className={styles.fileIcon}>{asset.mimeType === "application/pdf" ? "PDF" : asset.mimeType.includes("sheet") || asset.mimeType.includes("excel") ? "XLS" : "DOC"}</div><div className={styles.fileInfo}><strong>{asset.filename}</strong><span>{kindLabels[asset.kind]} · версия {asset.version} · {formatSize(asset.sizeBytes)}</span>{asset.importBatch && <small>Черновик импорта: {asset.importBatch.rowCount ? `${asset.importBatch.approvedCount} из ${asset.importBatch.rowCount} строк подтверждено` : "ожидает подключения обработчика"}</small>}</div><span className={`${styles.assetStatus} ${asset.status === "FAILED" ? styles.assetStatusFailed : ""}`}>{statusLabels[asset.status]}</span><div className={styles.fileActions}><a href={asset.url} target="_blank" rel="noreferrer">Открыть</a>{asset.status === "REVIEW_REQUIRED" && <button type="button" onClick={() => { void updateAsset(asset.id, { reviewed: true }); }}>Проверено</button>}<button className={styles.dangerAction} type="button" onClick={() => { void removeAsset(asset); }}>Удалить</button></div></article>)}</div> : <div className={styles.assetEmpty}>Документы ещё не загружены.</div>}
    </div>
  </section>;
}

function formatSize(bytes: number) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(bytes / 1024)} КБ`; }
