"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreateDevelopmentProjectRequest, DevelopmentDeveloperRecord, DevelopmentProjectRecord } from "@/types/developments";

import { Field } from "./DevelopmentsCatalog";
import styles from "./developments.module.css";

type ProjectTab = "all" | "construction" | "completed" | "launch";
const constructionLabels = { PLANNED: "Планируется", UNDER_CONSTRUCTION: "Строится", COMPLETED: "Сдан", PAUSED: "Приостановлен" } as const;
const salesLabels = { EXPECTED: "Продажи ожидаются", LAUNCH: "Старт продаж", OPEN: "Продажи открыты", CLOSED: "Продажи завершены" } as const;

export function DeveloperDetails({ developerId }: { developerId: string }) {
  const [developer, setDeveloper] = useState<DevelopmentDeveloperRecord | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<ProjectTab>("all"); const [query, setQuery] = useState(""); const [creating, setCreating] = useState(false);
  async function load() {
    setState("loading");
    try { const response = await fetch(`/api/crm/development-developers/${developerId}`, { cache: "no-store" }); const payload = await response.json() as { developer?: DevelopmentDeveloperRecord }; if (!response.ok || !payload.developer) throw new Error(); setDeveloper(payload.developer); setState("ready"); }
    catch { setState("error"); }
  }
  useEffect(() => {
    let active = true;
    void fetch(`/api/crm/development-developers/${developerId}`, { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as { developer?: DevelopmentDeveloperRecord };
      if (!response.ok || !payload.developer) throw new Error();
      if (active) { setDeveloper(payload.developer); setState("ready"); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [developerId]);

  const projects = useMemo(() => (developer?.projects || []).filter((item) => {
    const matchesTab = tab === "all" || (tab === "construction" ? item.constructionStatus === "UNDER_CONSTRUCTION" : tab === "completed" ? item.constructionStatus === "COMPLETED" : item.salesStatus === "LAUNCH");
    const normalized = query.trim().toLocaleLowerCase("ru");
    return matchesTab && (!normalized || `${item.name} ${item.address || ""} ${item.district || ""}`.toLocaleLowerCase("ru").includes(normalized));
  }), [developer, query, tab]);

  if (state === "loading") return <PageState title="Загружаем застройщика" />;
  if (state === "error" || !developer) return <PageState title="Застройщик не найден" action="Вернуться в каталог" />;
  return <section className={styles.detailPage}>
    <header className={styles.detailTopbar}><Link href="/objects">← К объектам</Link><span>Новостройки / {developer.name}</span></header>
    <div className={styles.detailContent}>
      <section className={styles.developerHero}><div className={styles.heroMark}>{developer.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div className={styles.heroText}><span>Застройщик</span><h1>{developer.name}</h1><p>{developer.description || "Описание ещё не добавлено."}</p><div className={styles.contactRow}>{developer.website && <a href={developer.website} target="_blank" rel="noreferrer">Официальный сайт ↗</a>}{developer.phone && <a href={`tel:${developer.phone}`}>{developer.phone}</a>}{developer.email && <a href={`mailto:${developer.email}`}>{developer.email}</a>}</div></div><dl className={styles.heroStats}><div><dt>Всего проектов</dt><dd>{developer.projectCounts.all}</dd></div><div><dt>Строятся</dt><dd>{developer.projectCounts.construction}</dd></div><div><dt>Сданы</dt><dd>{developer.projectCounts.completed}</dd></div></dl></section>
      <section className={styles.projectsSection}><header><div><span>Проекты</span><h2>Жилые комплексы</h2></div><button type="button" onClick={() => setCreating(true)}>＋ Добавить проект</button></header>
        <div className={styles.projectToolbar}><div className={styles.statusTabs}><Tab active={tab === "all"} onClick={() => setTab("all")}>Все · {developer.projectCounts.all}</Tab><Tab active={tab === "construction"} onClick={() => setTab("construction")}>Строятся · {developer.projectCounts.construction}</Tab><Tab active={tab === "completed"} onClick={() => setTab("completed")}>Сданы · {developer.projectCounts.completed}</Tab><Tab active={tab === "launch"} onClick={() => setTab("launch")}>Старт продаж · {developer.projectCounts.launch}</Tab></div><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти проект" /></div>
        {projects.length ? <div className={styles.projectGrid}>{projects.map((item) => <Link className={styles.projectCard} href={`/objects/developers/${developer.id}/projects/${item.id}`} key={item.id}><div className={styles.projectVisual} style={item.imageUrl ? { backgroundImage: `url("${item.imageUrl}")` } : undefined}><span>{constructionLabels[item.constructionStatus]}</span><b>{item.name.slice(0, 1)}</b></div><div className={styles.projectBody}><div><h3>{item.name}</h3><span>›</span></div><p>{item.address || item.district || "Адрес уточняется"}</p><ul><li>{constructionLabels[item.constructionStatus]}</li><li>{salesLabels[item.salesStatus]}</li></ul>{item.verifiedAt && <small>Проверено {new Intl.DateTimeFormat("ru-RU").format(new Date(item.verifiedAt))}</small>}</div></Link>)}</div> : <div className={styles.projectsEmpty}>В этом разделе пока нет проектов.</div>}
      </section>
    </div>
    {creating && <ProjectModal developerId={developer.id} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />}
  </section>;
}

export function ProjectDetails({ developerId, projectId }: { developerId: string; projectId: string }) {
  const [developer, setDeveloper] = useState<DevelopmentDeveloperRecord | null>(null);
  const [editing, setEditing] = useState(false);
  async function reload() { const response = await fetch(`/api/crm/development-developers/${developerId}`, { cache: "no-store" }); const payload = await response.json() as { developer?: DevelopmentDeveloperRecord }; setDeveloper(payload.developer || null); }
  useEffect(() => { void fetch(`/api/crm/development-developers/${developerId}`, { cache: "no-store" }).then((response) => response.json()).then((payload: { developer?: DevelopmentDeveloperRecord }) => setDeveloper(payload.developer || null)); }, [developerId]);
  const item = developer?.projects?.find((project) => project.id === projectId);
  if (!developer) return <PageState title="Загружаем проект" />;
  if (!item) return <PageState title="Проект не найден" action="Вернуться к застройщику" href={`/objects/developers/${developerId}`} />;
  return <section className={styles.detailPage}><header className={styles.detailTopbar}><Link href={`/objects/developers/${developer.id}`}>← {developer.name}</Link><span>Новостройки / {developer.name} / {item.name}</span><button className={styles.topbarAction} type="button" onClick={() => setEditing(true)}>Редактировать</button></header><main className={styles.projectDetail}>
    <section className={styles.projectDetailHero} style={item.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(18,18,17,.72), rgba(18,18,17,.18)), url("${item.imageUrl}")` } : undefined}><div><span>{constructionLabels[item.constructionStatus]}</span><h1>{item.name}</h1><p>{item.address || item.district || "Адрес уточняется"}</p></div></section>
    <div className={styles.projectDetailGrid}><section><span className={styles.sectionEyebrow}>О проекте</span><h2>Основная информация</h2><p>{item.description || "Описание проекта можно дополнить после проверки информации у застройщика."}</p>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">Открыть официальный источник ↗</a>}</section><dl><Info label="Строительство" value={constructionLabels[item.constructionStatus]} /><Info label="Продажи" value={salesLabels[item.salesStatus]} /><Info label="Срок сдачи" value={item.plannedCompletion || "Уточняется"} /><Info label="Класс" value={item.className || "Уточняется"} /><Info label="Корпуса" value={item.buildingsCount?.toString() || "Уточняется"} /><Info label="Секции" value={item.sectionsCount?.toString() || "Уточняется"} /><Info label="Этажность" value={item.floors || "Уточняется"} /></dl></div>
    <section className={styles.futureLayer}><div><span className={styles.sectionEyebrow}>Следующий слой</span><h2>Корпуса, шахматка и файлы</h2><p>Здесь появятся доступные квартиры, цены, планировки, акции и документы проекта. Файлы будут храниться в закрытом Cloudflare R2.</p></div><span>Подготовлено для следующего этапа</span></section>
  </main>{editing && <ProjectModal developerId={developer.id} initial={item} onClose={() => setEditing(false)} onCreated={() => { setEditing(false); void reload(); }} />}</section>;
}

function ProjectModal({ developerId, initial, onClose, onCreated }: { developerId: string; initial?: DevelopmentProjectRecord; onClose: () => void; onCreated: () => void }) {
  const [draft, setDraft] = useState<CreateDevelopmentProjectRequest>(initial ? { name: initial.name, address: initial.address, district: initial.district, description: initial.description, constructionStatus: initial.constructionStatus, salesStatus: initial.salesStatus, plannedCompletion: initial.plannedCompletion, className: initial.className, buildingsCount: initial.buildingsCount, sectionsCount: initial.sectionsCount, floors: initial.floors, imageUrl: initial.imageUrl, sourceUrl: initial.sourceUrl } : { name: "", address: "", district: "", constructionStatus: "UNDER_CONSTRUCTION", salesStatus: "OPEN", sourceUrl: "" }); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const update = (key: keyof CreateDevelopmentProjectRequest, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  async function save() { setSaving(true); setError(""); try { const response = await fetch(initial ? `/api/crm/development-projects/${initial.id}` : `/api/crm/development-developers/${developerId}/projects`, { method: initial ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) }); const payload = await response.json() as { project?: DevelopmentProjectRecord; message?: string }; if (!response.ok || !payload.project) throw new Error(payload.message || "Не удалось сохранить проект."); onCreated(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить проект."); } finally { setSaving(false); } }
  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть" /><form className={styles.modal} onSubmit={(event) => { event.preventDefault(); void save(); }}><header><div><span>{initial ? "Редактирование" : "Новый проект"}</span><h3>{initial ? initial.name : "Добавить жилой комплекс"}</h3></div><button type="button" onClick={onClose}>×</button></header><div className={styles.formBody}><Field label="Название" value={draft.name} onChange={(value) => update("name", value)} required /><Field label="Описание" value={draft.description || ""} onChange={(value) => update("description", value)} multiline /><div className={styles.formColumns}><Field label="Адрес" value={draft.address || ""} onChange={(value) => update("address", value)} /><Field label="Район" value={draft.district || ""} onChange={(value) => update("district", value)} /></div><div className={styles.formColumns}><Select label="Строительство" value={draft.constructionStatus || "UNDER_CONSTRUCTION"} onChange={(value) => update("constructionStatus", value)} options={constructionLabels} /><Select label="Продажи" value={draft.salesStatus || "OPEN"} onChange={(value) => update("salesStatus", value)} options={salesLabels} /></div><div className={styles.formColumns}><Field label="Плановый срок сдачи" value={draft.plannedCompletion || ""} onChange={(value) => update("plannedCompletion", value)} /><Field label="Класс" value={draft.className || ""} onChange={(value) => update("className", value)} /></div><div className={styles.formColumns}><Field label="Этажность" value={draft.floors || ""} onChange={(value) => update("floors", value)} /><Field label="Ссылка на обложку" value={draft.imageUrl || ""} onChange={(value) => update("imageUrl", value)} /></div><Field label="Официальный источник" value={draft.sourceUrl || ""} onChange={(value) => update("sourceUrl", value)} />{error && <p className={styles.formError}>{error}</p>}</div><footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.primary} type="submit" disabled={!draft.name.trim() || saving}>{saving ? "Сохраняем…" : "Сохранить"}</button></footer></form></div>;
}
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button className={active ? styles.activeTab : ""} type="button" onClick={onClick}>{children}</button>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Record<string, string> }) { return <label className={styles.field}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{Object.entries(options).map(([key, labelValue]) => <option value={key} key={key}>{labelValue}</option>)}</select></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function PageState({ title, action, href = "/objects" }: { title: string; action?: string; href?: string }) { return <div className={styles.pageState}><span>⌂</span><h2>{title}</h2>{action && <Link href={href}>{action}</Link>}</div>; }
