"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreateDevelopmentDeveloperRequest, DevelopmentDeveloperRecord } from "@/types/developments";

import styles from "./developments.module.css";

export function DevelopmentsCatalog() {
  const [developers, setDevelopers] = useState<DevelopmentDeveloperRecord[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setState("loading");
    try {
      const response = await fetch("/api/crm/development-developers", { cache: "no-store" });
      const payload = await response.json() as { developers?: DevelopmentDeveloperRecord[] };
      if (!response.ok || !payload.developers) throw new Error();
      setDevelopers(payload.developers); setState("ready");
    } catch { setState("error"); }
  }
  useEffect(() => {
    let active = true;
    void fetch("/api/crm/development-developers", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { developers?: DevelopmentDeveloperRecord[] };
      if (!response.ok || !payload.developers) throw new Error();
      if (active) { setDevelopers(payload.developers); setState("ready"); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return developers.filter((item) => !normalized || `${item.name} ${item.description || ""}`.toLocaleLowerCase("ru").includes(normalized));
  }, [developers, query]);

  return <section className={styles.catalog}>
    <header className={styles.catalogHeader}>
      <div><span>Первичная недвижимость</span><h3>Застройщики Одессы</h3><p>Проекты, статусы строительства и официальные источники в одном каталоге.</p></div>
      <button type="button" onClick={() => setCreating(true)}>＋ Добавить застройщика</button>
    </header>
    <label className={styles.catalogSearch}><span>Поиск</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название застройщика" /></label>
    {state === "loading" ? <CatalogState title="Загружаем застройщиков" /> : state === "error" ? <CatalogState title="Не удалось загрузить каталог" action="Повторить" onAction={() => { void load(); }} /> : visible.length ? <div className={styles.developerGrid}>{visible.map((developer) => <Link className={styles.developerCard} href={`/objects/developers/${developer.id}`} key={developer.id}>
      <div className={styles.developerMark}>{developer.logoUrl ? <span style={{ backgroundImage: `url("${developer.logoUrl}")` }} /> : initials(developer.name)}</div>
      <div className={styles.developerBody}><div><h4>{developer.name}</h4><b>›</b></div><p>{developer.description || "Описание ещё не добавлено."}</p><dl><div><dt>Строятся</dt><dd>{developer.projectCounts.construction}</dd></div><div><dt>Сданы</dt><dd>{developer.projectCounts.completed}</dd></div><div><dt>Старт продаж</dt><dd>{developer.projectCounts.launch}</dd></div></dl></div>
    </Link>)}</div> : <CatalogState title="Застройщики не найдены" />}
    {creating && <DeveloperModal onClose={() => setCreating(false)} onCreated={(developer) => { setDevelopers((items) => [...items, developer].sort((a, b) => a.name.localeCompare(b.name, "ru"))); setCreating(false); }} />}
  </section>;
}

function DeveloperModal({ onClose, onCreated }: { onClose: () => void; onCreated: (developer: DevelopmentDeveloperRecord) => void }) {
  const [draft, setDraft] = useState<CreateDevelopmentDeveloperRequest>({ name: "", description: "", website: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const update = (key: keyof CreateDevelopmentDeveloperRequest, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/crm/development-developers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json() as { developer?: DevelopmentDeveloperRecord; message?: string };
      if (!response.ok || !payload.developer) throw new Error(payload.message || "Не удалось добавить застройщика.");
      onCreated(payload.developer);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось добавить застройщика."); }
    finally { setSaving(false); }
  }
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" aria-label="Закрыть" onClick={onClose} /><form className={styles.modal} onSubmit={(event) => { event.preventDefault(); void save(); }}><header><div><span>Новый застройщик</span><h3>Добавить в каталог</h3></div><button type="button" onClick={onClose}>×</button></header><div className={styles.formBody}>
    <Field label="Название" value={draft.name} onChange={(value) => update("name", value)} required />
    <Field label="Описание" value={draft.description || ""} onChange={(value) => update("description", value)} multiline />
    <Field label="Официальный сайт" value={draft.website || ""} onChange={(value) => update("website", value)} />
    <div className={styles.formColumns}><Field label="Телефон" value={draft.phone || ""} onChange={(value) => update("phone", value)} /><Field label="Email" value={draft.email || ""} onChange={(value) => update("email", value)} /></div>
    {error && <p className={styles.formError}>{error}</p>}
  </div><footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.primary} type="submit" disabled={!draft.name.trim() || saving}>{saving ? "Добавляем…" : "Добавить"}</button></footer></form></div>;
}

export function Field({ label, value, onChange, required, multiline }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean }) {
  return <label className={styles.field}><span>{label}{required && <b> *</b>}</span>{multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} required={required} />}</label>;
}
function CatalogState({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) { return <div className={styles.catalogState}><span>⌂</span><h4>{title}</h4>{action && <button type="button" onClick={onAction}>{action}</button>}</div>; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
