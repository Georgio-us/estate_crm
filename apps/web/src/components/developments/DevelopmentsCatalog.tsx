"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useCurrentUser } from "@/components/auth/AuthContext";
import type { CreateDevelopmentDeveloperRequest, DevelopmentDeveloperRecord } from "@/types/developments";

import styles from "./developments.module.css";

type CatalogView = "active" | "archive";

export function DevelopmentsCatalog() {
  const user = useCurrentUser();
  const canManage = user.organization.role !== "MANAGER" || Boolean(user.organization.permissions?.manageDevelopments);
  const [developers, setDevelopers] = useState<DevelopmentDeveloperRecord[]>([]);
  const [archived, setArchived] = useState<DevelopmentDeveloperRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [view, setView] = useState<CatalogView>("active");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DevelopmentDeveloperRecord | "new" | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    setState("loading");
    try {
      const [activeResponse, archiveResponse] = await Promise.all([
        fetch("/api/crm/development-developers", { cache: "no-store" }),
        fetch("/api/crm/development-developers?archived=only", { cache: "no-store" }),
      ]);
      const [activePayload, archivePayload] = await Promise.all([activeResponse.json(), archiveResponse.json()]) as Array<{ developers?: DevelopmentDeveloperRecord[] }>;
      if (!activeResponse.ok || !archiveResponse.ok || !activePayload.developers || !archivePayload.developers) throw new Error();
      setDevelopers(activePayload.developers); setArchived(archivePayload.developers); setState("ready");
    } catch { setState("error"); }
  }
  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/crm/development-developers", { cache: "no-store" }),
      fetch("/api/crm/development-developers?archived=only", { cache: "no-store" }),
    ]).then(async ([activeResponse, archiveResponse]) => {
      const [activePayload, archivePayload] = await Promise.all([activeResponse.json(), archiveResponse.json()]) as Array<{ developers?: DevelopmentDeveloperRecord[] }>;
      if (!activeResponse.ok || !archiveResponse.ok || !activePayload.developers || !archivePayload.developers) throw new Error();
      if (active) { setDevelopers(activePayload.developers); setArchived(archivePayload.developers); setState("ready"); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return developers.filter((item) => !normalized || `${item.name} ${item.description || ""}`.toLocaleLowerCase("ru").includes(normalized));
  }, [developers, query]);
  const archivedDevelopers = archived.filter((item) => item.archivedAt);
  const archivedProjects = archived.flatMap((developer) => (developer.projects || []).filter((project) => project.archivedAt).map((project) => ({ developer, project })));
  const archiveCount = archivedDevelopers.length + archivedProjects.length;

  async function lifecycle(kind: "developer" | "project", id: string, action: "archive" | "restore" | "delete") {
    const deleting = action === "delete";
    if (deleting && !window.confirm("Удалить запись навсегда вместе с загруженными файлами? Это действие нельзя отменить.")) return;
    setNotice(""); setMenuId(null);
    const base = kind === "developer" ? `/api/crm/development-developers/${id}` : `/api/crm/development-projects/${id}`;
    const response = await fetch(deleting ? base : `${base}/${action}`, { method: deleting ? "DELETE" : "POST" });
    const payload = await response.json() as { message?: string };
    if (!response.ok) { setNotice(payload.message || "Не удалось выполнить действие."); return; }
    setNotice(action === "archive" ? "Перенесено в архив." : action === "restore" ? "Восстановлено из архива." : "Удалено навсегда.");
    await load();
    if (action === "archive") setView("archive");
  }

  return <section className={styles.catalog}>
    <header className={styles.catalogHeader}>
      <div><span>Первичная недвижимость</span><h3>Застройщики Одессы</h3><p>Самостоятельный каталог застройщиков, проектов и материалов.</p></div>
      {canManage && <button type="button" onClick={() => setEditing("new")}>＋ Добавить застройщика</button>}
    </header>
    <div className={styles.developmentTabs}><button className={view === "active" ? styles.activeTab : ""} type="button" onClick={() => setView("active")}>Застройщики · {developers.length}</button><button className={view === "archive" ? styles.activeTab : ""} type="button" onClick={() => setView("archive")}>Архив · {archiveCount}</button></div>
    {notice && <p className={styles.catalogNotice} role="status">{notice}</p>}
    {view === "active" && <label className={styles.catalogSearch}><span>Поиск</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название застройщика" /></label>}
    {state === "loading" ? <CatalogState title="Загружаем застройщиков" /> : state === "error" ? <CatalogState title="Не удалось загрузить каталог" action="Повторить" onAction={() => { void load(); }} /> : view === "active" ? visible.length ? <div className={styles.developerGrid}>{visible.map((developer) => <article className={styles.developerCard} key={developer.id}>
      <Link className={styles.developerCardLink} href={`/objects/developers/${developer.id}`}>
        <div className={styles.developerMark}>{developer.coverUrl || developer.logoUrl ? <span style={{ backgroundImage: `url("${developer.coverUrl || developer.logoUrl}")` }} /> : initials(developer.name)}</div>
        <div className={styles.developerBody}><div><h4>{developer.name}</h4><b>›</b></div><p>{developer.description || "Описание ещё не добавлено."}</p><dl><div><dt>Строятся</dt><dd>{developer.projectCounts.construction}</dd></div><div><dt>Сданы</dt><dd>{developer.projectCounts.completed}</dd></div><div><dt>Старт продаж</dt><dd>{developer.projectCounts.launch}</dd></div></dl></div>
      </Link>
      {canManage && <CardMenu open={menuId === developer.id} onToggle={() => setMenuId((current) => current === developer.id ? null : developer.id)} actions={[{ label: "Редактировать", run: () => setEditing(developer) }, { label: "Перенести в архив", run: () => { void lifecycle("developer", developer.id, "archive"); } }]} />}
    </article>)}</div> : <CatalogState title="Застройщики не найдены" /> : archiveCount ? <div className={styles.archiveStack}>
      {archivedDevelopers.length > 0 && <ArchiveGroup title="Застройщики">{archivedDevelopers.map((developer) => <ArchiveRow key={developer.id} title={developer.name} subtitle={`${developer.projectCounts.all} проектов`} canManage={canManage} onRestore={() => { void lifecycle("developer", developer.id, "restore"); }} onDelete={() => { void lifecycle("developer", developer.id, "delete"); }} />)}</ArchiveGroup>}
      {archivedProjects.length > 0 && <ArchiveGroup title="Проекты">{archivedProjects.map(({ developer, project }) => <ArchiveRow key={project.id} title={project.name} subtitle={developer.name} canManage={canManage} onRestore={() => { void lifecycle("project", project.id, "restore"); }} onDelete={() => { void lifecycle("project", project.id, "delete"); }} />)}</ArchiveGroup>}
    </div> : <CatalogState title="Архив новостроек пуст" />}
    {editing && <DeveloperModal initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
  </section>;
}

function CardMenu({ open, onToggle, actions }: { open: boolean; onToggle: () => void; actions: Array<{ label: string; run: () => void }> }) { return <div className={styles.cardMenu}><button type="button" aria-label="Действия" aria-expanded={open} onClick={onToggle}>•••</button>{open && <div>{actions.map((action) => <button type="button" key={action.label} onClick={action.run}>{action.label}</button>)}</div>}</div>; }
function ArchiveGroup({ title, children }: { title: string; children: ReactNode }) { return <section className={styles.archiveGroup}><h4>{title}</h4><div>{children}</div></section>; }
function ArchiveRow({ title, subtitle, canManage, onRestore, onDelete }: { title: string; subtitle: string; canManage: boolean; onRestore: () => void; onDelete: () => void }) { return <article className={styles.archiveRow}><div><strong>{title}</strong><span>{subtitle}</span></div>{canManage && <div><button type="button" onClick={onRestore}>Восстановить</button><button className={styles.dangerAction} type="button" onClick={onDelete}>Удалить навсегда</button></div>}</article>; }

function DeveloperModal({ initial, onClose, onSaved }: { initial?: DevelopmentDeveloperRecord; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<CreateDevelopmentDeveloperRequest>(initial ? { name: initial.name, description: initial.description, website: initial.website, phone: initial.phone, email: initial.email, sourceUrl: initial.sourceUrl } : { name: "", description: "", website: "", phone: "", email: "" });
  const [cover, setCover] = useState<File | null>(null); const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const update = (key: keyof CreateDevelopmentDeveloperRequest, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  async function uploadCover(developerId: string, file: File) {
    const body = { filename: file.name, mimeType: file.type, sizeBytes: file.size };
    const prepared = await fetch(`/api/crm/development-developers/${developerId}/cover/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await prepared.json() as { uploadUrl?: string; message?: string };
    if (!prepared.ok || !payload.uploadUrl) throw new Error(payload.message || "Не удалось подготовить обложку.");
    const upload = await fetch(payload.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    if (!upload.ok) throw new Error("Хранилище не приняло обложку.");
    const finalized = await fetch(`/api/crm/development-developers/${developerId}/cover/finalize`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!finalized.ok) throw new Error("Не удалось завершить загрузку обложки.");
  }
  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch(initial ? `/api/crm/development-developers/${initial.id}` : "/api/crm/development-developers", { method: initial ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json() as { developer?: DevelopmentDeveloperRecord; message?: string };
      if (!response.ok || !payload.developer) throw new Error(payload.message || "Не удалось сохранить застройщика.");
      if (cover) await uploadCover(payload.developer.id, cover);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить застройщика."); }
    finally { setSaving(false); }
  }
  async function removeCover() {
    if (!initial?.coverUrl || !window.confirm("Удалить текущую обложку?")) return;
    const response = await fetch(`/api/crm/development-developers/${initial.id}/cover`, { method: "DELETE" });
    if (!response.ok) { setError("Не удалось удалить обложку."); return; }
    onSaved();
  }
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть" onClick={onClose} /><form className={styles.modal} onSubmit={(event) => { event.preventDefault(); void save(); }}><header><div><span>{initial ? "Редактирование" : "Новый застройщик"}</span><h3>{initial?.name || "Добавить в каталог"}</h3></div><button type="button" onClick={onClose}>×</button></header><div className={styles.formBody}>
    <div className={styles.coverPicker}>{initial?.coverUrl && <span style={{ backgroundImage: `url("${initial.coverUrl}")` }} />}<div><strong>Обложка карточки</strong><small>{cover?.name || (initial?.coverUrl ? "Текущая обложка загружена" : "JPG, PNG, WebP или AVIF до 25 МБ")}</small><input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" onChange={(event) => setCover(event.target.files?.[0] || null)} /><button type="button" onClick={() => input.current?.click()}>{initial?.coverUrl || cover ? "Заменить" : "Загрузить"}</button>{initial?.coverUrl && <button className={styles.dangerAction} type="button" onClick={() => { void removeCover(); }}>Удалить</button>}</div></div>
    <Field label="Название" value={draft.name} onChange={(value) => update("name", value)} required /><Field label="Описание" value={draft.description || ""} onChange={(value) => update("description", value)} multiline /><Field label="Официальный сайт" value={draft.website || ""} onChange={(value) => update("website", value)} /><div className={styles.formColumns}><Field label="Телефон" value={draft.phone || ""} onChange={(value) => update("phone", value)} /><Field label="Email" value={draft.email || ""} onChange={(value) => update("email", value)} /></div>{error && <p className={styles.formError}>{error}</p>}
  </div><footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.primary} type="submit" disabled={!draft.name.trim() || saving}>{saving ? "Сохраняем…" : "Сохранить"}</button></footer></form></div>;
}

export function Field({ label, value, onChange, required, multiline }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean }) { return <label className={styles.field}><span>{label}{required && <b> *</b>}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} required={required} />}</label>; }
function CatalogState({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { return <div className={styles.catalogState}><span>⌂</span><h4>{title}</h4>{action && <button type="button" onClick={onAction}>{action}</button>}</div>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
