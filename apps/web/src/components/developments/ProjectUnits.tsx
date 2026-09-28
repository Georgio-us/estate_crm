"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
import type { DevelopmentUnitRecord, DevelopmentUnitStatus } from "@/types/developments";
import styles from "./developments.module.css";

const statusLabels: Record<DevelopmentUnitStatus, string> = { AVAILABLE: "В продаже", RESERVED: "Резерв", SOLD: "Продано", UNKNOWN: "Уточняется" };
const currencyLabels = { USD: "USD — доллар", EUR: "EUR — евро", UAH: "UAH — гривна" } as const;
type UnitEvent = { id: string; title: string; changes: unknown; actorName: string | null; createdAt: string };
type UnitDetails = DevelopmentUnitRecord & { events?: UnitEvent[] };
type UnitDraft = Pick<DevelopmentUnitRecord, "floor" | "rooms" | "area" | "price" | "pricePerSquareMeter" | "currency" | "status" | "renovationType" | "renovationCompletion" | "note">;

export function ProjectUnits({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const currentUser = useCurrentUser();
  const canManage = currentUser.organization.role !== "MANAGER" || Boolean(currentUser.organization.permissions?.manageDevelopments);
  const [units, setUnits] = useState<DevelopmentUnitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DevelopmentUnitStatus | "ALL">("ALL");
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState<UnitDetails | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/development-projects/${projectId}/units?archived=${archived ? "only" : "active"}&refresh=${refreshKey}`, { cache: "no-store" });
      const payload = await response.json() as { units?: DevelopmentUnitRecord[] };
      if (!response.ok || !payload.units) throw new Error();
      setUnits(payload.units);
    } catch { setUnits([]); }
    finally { setLoading(false); }
  }, [archived, projectId, refreshKey]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const visible = useMemo(() => units.filter((unit) => {
    const haystack = `${unit.unitNumber} ${unit.building || ""} ${unit.section || ""}`.toLocaleLowerCase("ru");
    return (status === "ALL" || unit.status === status) && haystack.includes(query.trim().toLocaleLowerCase("ru"));
  }), [query, status, units]);
  const available = units.filter((unit) => unit.status === "AVAILABLE").length;

  async function openUnit(unit: DevelopmentUnitRecord) {
    const response = await fetch(`/api/crm/development-projects/${projectId}/units/${unit.id}`, { cache: "no-store" });
    const payload = await response.json() as { unit?: UnitDetails };
    setSelected(payload.unit || { ...unit, events: [] });
  }

  return <section className={styles.unitsSection}><header><div><span className={styles.sectionEyebrow}>Структура продаж</span><h2>Квартиры и помещения</h2><p>{units.length ? `Всего ${units.length}, в продаже ${available}. Строки шахматки являются отдельными управляемыми помещениями.` : archived ? "В архиве пока нет помещений." : "Загрузите Excel-шахматку, сопоставьте колонки и опубликуйте её — помещения появятся здесь."}</p></div><div className={styles.unitsFilters}><button className={archived ? styles.activeUnitView : ""} type="button" onClick={() => setArchived((value) => !value)}>{archived ? "← Рабочая база" : "Архив"}</button>{units.length > 0 && <><input type="search" placeholder="№, корпус или секция" value={query} onChange={(event) => setQuery(event.target.value)} /><select value={status} onChange={(event) => setStatus(event.target.value as DevelopmentUnitStatus | "ALL")}><option value="ALL">Все статусы</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></>}</div></header>
    {loading ? <div className={styles.assetEmpty}>Загружаем шахматку…</div> : units.length === 0 ? <div className={styles.unitsEmpty}><strong>{archived ? "Архив пуст" : "Шахматка пока не опубликована"}</strong><span>{archived ? "Перенесённые помещения появятся здесь." : "Excel-файл останется в документах, а его строки после проверки станут рабочей базой помещений."}</span></div> : <div className={styles.unitsTable}><div className={styles.unitsHead}><b>№</b><b>Корпус / секция</b><b>Этаж</b><b>Комнаты</b><b>Площадь</b><b>Цена</b><b>Ремонт</b><b>Статус</b></div>{visible.map((unit) => <button className={styles.unitRow} type="button" key={unit.id} onClick={() => { void openUnit(unit); }}><strong>{unit.unitNumber}{unit.manualFields.length > 0 && <i title="Есть ручные изменения">✎</i>}</strong><span>{[unit.building, unit.section].filter(Boolean).join(" · ") || "—"}</span><span>{unit.floor ?? "—"}</span><span>{unit.roomsLabel || unit.rooms || "—"}</span><span>{unit.area != null ? `${unit.area} м²` : "—"}</span><span>{unit.price != null ? `${new Intl.NumberFormat("ru-RU").format(unit.price)} ${unit.currency}` : unit.pricePerSquareMeter != null ? `${new Intl.NumberFormat("ru-RU").format(unit.pricePerSquareMeter)} ${unit.currency}/м²` : "—"}</span><span title={unit.renovationCompletion || unit.note || undefined}>{unit.renovationType || unit.renovationCompletion || "—"}</span><span className={`${styles.unitStatus} ${styles[`unitStatus${unit.status}`]}`}>{statusLabels[unit.status]}</span></button>)}{visible.length === 0 && <p className={styles.unitsNoResults}>По выбранному фильтру помещений нет.</p>}</div>}
    {selected && <UnitDrawer projectId={projectId} unit={selected} canManage={canManage} onClose={() => setSelected(null)} onChanged={async () => { setSelected(null); await load(); }} />}
  </section>;
}

function UnitDrawer({ projectId, unit, canManage, onClose, onChanged }: { projectId: string; unit: UnitDetails; canManage: boolean; onClose: () => void; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<UnitDraft>({ floor: unit.floor, rooms: unit.rooms, area: unit.area, price: unit.price, pricePerSquareMeter: unit.pricePerSquareMeter, currency: unit.currency, status: unit.status, renovationType: unit.renovationType, renovationCompletion: unit.renovationCompletion, note: unit.note });
  const update = <K extends keyof UnitDraft>(key: K, value: UnitDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function save() {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/crm/development-projects/${projectId}/units/${unit.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Не удалось сохранить квартиру.");
      await onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить квартиру."); }
    finally { setSaving(false); }
  }
  async function lifecycle(action: "archive" | "restore") {
    if (!window.confirm(action === "archive" ? "Перенести помещение в архив?" : "Вернуть помещение в рабочую базу?")) return;
    const response = await fetch(`/api/crm/development-projects/${projectId}/units/${unit.id}/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
    if (!response.ok) return setError("Не удалось изменить состояние помещения.");
    await onChanged();
  }
  async function remove() {
    if (!window.confirm("Удалить помещение навсегда? Это действие нельзя отменить.")) return;
    const response = await fetch(`/api/crm/development-projects/${projectId}/units/${unit.id}`, { method: "DELETE" });
    if (!response.ok) return setError("Не удалось удалить помещение.");
    await onChanged();
  }
  return <div className={styles.unitDrawerLayer}><button className={styles.unitDrawerBackdrop} type="button" aria-label="Закрыть" onClick={onClose} /><aside className={styles.unitDrawer}><header><div><span>Квартира / помещение</span><h3>№ {unit.unitNumber}</h3><p>{[unit.building, unit.section].filter(Boolean).join(" · ") || "Без корпуса и секции"}</p></div><button type="button" onClick={onClose}>×</button></header>{editing ? <div className={styles.unitForm}><div className={styles.formColumns}><UnitNumberField label="Этаж" value={draft.floor} integer onChange={(value) => update("floor", value)} /><UnitNumberField label="Комнаты" value={draft.rooms} integer onChange={(value) => update("rooms", value)} /></div><div className={styles.formColumns}><UnitNumberField label="Площадь, м²" value={draft.area} onChange={(value) => update("area", value)} /><UnitNumberField label="Общая цена" value={draft.price} integer onChange={(value) => update("price", value)} /></div><UnitNumberField label="Цена за м²" value={draft.pricePerSquareMeter} integer onChange={(value) => update("pricePerSquareMeter", value)} /><label className={styles.field}><span>Валюта</span><select value={draft.currency} onChange={(event) => update("currency", event.target.value as UnitDraft["currency"])}>{Object.entries(currencyLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className={styles.field}><span>Статус</span><select value={draft.status} onChange={(event) => update("status", event.target.value as DevelopmentUnitStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className={styles.field}><span>Тип ремонта</span><input value={draft.renovationType || ""} onChange={(event) => update("renovationType", event.target.value || null)} /></label><label className={styles.field}><span>Срок окончания ремонта</span><input value={draft.renovationCompletion || ""} onChange={(event) => update("renovationCompletion", event.target.value || null)} /></label><label className={styles.field}><span>Примечание</span><textarea value={draft.note || ""} onChange={(event) => update("note", event.target.value || null)} /></label>{error && <p className={styles.formError}>{error}</p>}<footer><button type="button" onClick={() => setEditing(false)}>Отмена</button><button className={styles.primary} type="button" disabled={saving} onClick={() => { void save(); }}>{saving ? "Сохраняем…" : "Сохранить"}</button></footer></div> : <div className={styles.unitSummary}><dl><Info label="Статус" value={statusLabels[unit.status]} /><Info label="Этаж" value={unit.floor?.toString() || "—"} /><Info label="Комнаты" value={unit.roomsLabel || unit.rooms?.toString() || "—"} /><Info label="Площадь" value={unit.area != null ? `${unit.area} м²` : "—"} /><Info label="Цена" value={unit.price != null ? `${new Intl.NumberFormat("ru-RU").format(unit.price)} ${unit.currency}` : "—"} /><Info label="Цена за м²" value={unit.pricePerSquareMeter != null ? `${new Intl.NumberFormat("ru-RU").format(unit.pricePerSquareMeter)} ${unit.currency}` : "—"} /><Info label="Ремонт" value={unit.renovationType || "—"} /><Info label="Срок ремонта" value={unit.renovationCompletion || "—"} /></dl>{unit.note && <section><h4>Примечание</h4><p>{unit.note}</p></section>}{unit.manualFields.length > 0 && <p className={styles.manualNotice}>Ручные изменения защищены при следующем обновлении шахматки.</p>}{canManage && <div className={styles.unitActions}><button className={styles.primary} type="button" onClick={() => setEditing(true)}>Редактировать</button><button type="button" onClick={() => { void lifecycle(unit.archivedAt ? "restore" : "archive"); }}>{unit.archivedAt ? "Восстановить" : "В архив"}</button>{unit.archivedAt && <button className={styles.dangerAction} type="button" onClick={() => { void remove(); }}>Удалить навсегда</button>}</div>}{error && <p className={styles.formError}>{error}</p>}<section className={styles.unitHistory}><h4>История</h4>{unit.events?.length ? unit.events.map((event) => <article key={event.id}><strong>{event.title}</strong><span>{event.actorName || "Система"} · {new Date(event.createdAt).toLocaleString("ru-RU")}</span></article>) : <p>Ручных изменений пока не было.</p>}</section></div>}</aside></div>;
}

function UnitNumberField({ label, value, integer, onChange }: { label: string; value: number | null; integer?: boolean; onChange: (value: number | null) => void }) { return <label className={styles.field}><span>{label}</span><input type="number" min="0" step={integer ? "1" : "0.01"} value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /></label>; }
function Info({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
