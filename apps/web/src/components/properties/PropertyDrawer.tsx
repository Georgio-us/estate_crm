import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PropertyListing } from "@/types/crm";
type PropertyEventRecord = { id: string; title: string; description: string | null; actorName: string | null; createdAt: string };
type PropertyPhotoRecord = { id: string; filename: string; mimeType: string; sizeBytes: number; isCover: boolean; sortOrder: number; url: string; createdAt: string };
import styles from "./properties.module.css";

export function PropertyDrawer({ property, onSave, onClose, onRefresh, readOnly = false }: { property: PropertyListing; onSave: (property: PropertyListing) => Promise<void>; onClose: () => void; onRefresh?: () => Promise<void>; readOnly?: boolean }) {
  const [draft, setDraft] = useState(property);
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);
  const [photos, setPhotos] = useState<PropertyPhotoRecord[]>([]);
  const [events, setEvents] = useState<PropertyEventRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (patch: Partial<PropertyListing>) => setDraft((current) => ({ ...current, ...patch }));
  useEffect(() => { if (readOnly) return; void fetch("/api/crm/team/assignees").then((response) => response.json()).then((payload: { assignees?: Array<{ id: string; name: string }> }) => setAssignees(payload.assignees ?? [])).catch(() => {}); }, [readOnly]);
  async function loadMedia() {
    const response = await fetch(`/api/crm/properties/${property.id}/photos`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as { photos?: PropertyPhotoRecord[]; events?: PropertyEventRecord[] };
    setPhotos(payload.photos ?? []); setEvents(payload.events ?? []);
  }
  useEffect(() => {
    if (readOnly) return;
    let active = true;
    void fetch(`/api/crm/properties/${property.id}/photos`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { photos?: PropertyPhotoRecord[]; events?: PropertyEventRecord[] };
      if (active) { setPhotos(payload.photos ?? []); setEvents(payload.events ?? []); }
    }).catch(() => {});
    return () => { active = false; };
  }, [property.id, readOnly]);
  async function addPhoto(file: File) {
    if (!file.type.startsWith("image/")) { setError("Выберите изображение."); return; }
    const sizeMb = (file.size / 1024 / 1024).toFixed(2);
    const confirmOversize = file.size > 15 * 1024 * 1024;
    if (confirmOversize && !window.confirm(`Фотография «${file.name}» весит ${sizeMb} МБ (${file.size} байт), больше 15 МБ. Добавить?`)) return;
    setUploading(true); setError("");
    let preparedPhotoId: string | null = null;
    try {
      const prepared = await fetch(`/api/crm/properties/${property.id}/photos/prepare`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, confirmOversize }) });
      const data = await prepared.json() as { photoId?: string; uploadUrl?: string; message?: string };
      if (!prepared.ok || !data.uploadUrl || !data.photoId) throw new Error(data.message || "Не удалось подготовить загрузку.");
      preparedPhotoId = data.photoId;
      const upload = await fetch(data.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
      if (!upload.ok) throw new Error("Загрузка в Cloudflare R2 не удалась. Проверьте CORS бакета.");
      const finalized = await fetch(`/api/crm/properties/${property.id}/photos/${data.photoId}/finalize`, { method: "POST" });
      if (!finalized.ok) throw new Error("Не удалось завершить загрузку фото.");
      await loadMedia(); await onRefresh?.();
    } catch (cause) { if (preparedPhotoId) void fetch(`/api/crm/properties/${property.id}/photos/${preparedPhotoId}`, { method: "DELETE" }).catch(() => {}); setError(cause instanceof Error ? cause.message : "Фото не загружено."); }
    finally { setUploading(false); }
  }
  async function removePhoto(photoId: string) {
    if (!window.confirm("Удалить фотографию объекта?")) return;
    const response = await fetch(`/api/crm/properties/${property.id}/photos/${photoId}`, { method: "DELETE" });
    if (!response.ok) { setError("Не удалось удалить фотографию."); return; }
    await loadMedia(); await onRefresh?.();
  }

  async function save() {
    setSaving(true);
    setError("");
    try { await onSave(draft); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить объект."); setSaving(false); }
  }

  return (
    <div className={styles.drawerLayer}>
      <button className={styles.drawerBackdrop} type="button" onClick={onClose} aria-label="Закрыть карточку объекта" />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={`Объект ${property.title}`}>
        <header className={styles.drawerHeader}>
          <div><span>Объекты / {draft.category}</span><h2>{draft.title}</h2><p>{draft.code} · обновлён {draft.updatedAt}</p></div>
          <div>{readOnly && <span className={styles.demoPill}>Демо</span>}{!readOnly && <button type="button" aria-label="Меню объекта">•••</button>}<button type="button" onClick={onClose} aria-label="Закрыть">×</button></div>
        </header>
        <div className={styles.drawerBody}>
          <div className={styles.visualPane}>
            <div className={styles.heroImage} role="img" aria-label={`Фото: ${property.title}`} style={{ backgroundImage: `url("${photos[0]?.url ?? property.imageUrl}")` }} />
            <div className={styles.thumbnailRow}>{photos.length ? photos.map((photo) => <span key={photo.id} title={`${photo.filename} · ${(photo.sizeBytes / 1024 / 1024).toFixed(2)} МБ`} style={{ backgroundImage: `url("${photo.url}")` }} />) : <span style={{ backgroundImage: `url("${property.imageUrl}")` }} />}{!readOnly && <><input ref={photoInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addPhoto(file); event.target.value = ""; }} /><button type="button" disabled={uploading} onClick={() => photoInput.current?.click()}>{uploading ? "Загружаем…" : "＋ Добавить фото"}</button></>}</div>
            {photos.length > 0 && <section className={styles.description}><h3>Фотографии</h3>{photos.map((photo) => <p key={photo.id}>{photo.filename} · {(photo.sizeBytes / 1024 / 1024).toFixed(2)} МБ {!readOnly && <button type="button" onClick={() => { void removePhoto(photo.id); }}>Удалить</button>}</p>)}</section>}
            <section className={styles.description}><h3>Описание</h3>{readOnly ? <p>{draft.description}</p> : <textarea className={styles.drawerTextarea} value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Описание объекта" />}</section>
          </div>
          <div className={styles.propertyPane}>
            <div className={styles.priceBlock}><span>{draft.operation}</span><strong>{formatPrice(draft)}</strong><span className={`${styles.status} ${styles[`status_${draft.status}`]}`}>{draft.status}</span></div>
            {readOnly ? <ReadOnlyFacts property={draft} /> : <><section className={styles.factSection}>
              <h3>Основное</h3>
              <EditField label="Название"><input value={draft.title} onChange={(event) => update({ title: event.target.value })} /></EditField>
              <EditField label="Статус"><select value={draft.status} onChange={(event) => update({ status: event.target.value as PropertyListing["status"] })}><option>Доступен</option><option>Резерв</option><option>Продан</option></select></EditField>
              <EditField label="Операция"><select value={draft.operation} onChange={(event) => update({ operation: event.target.value as PropertyListing["operation"] })}><option>Продажа</option><option>Аренда</option></select></EditField>
              <EditField label="Цена"><input inputMode="decimal" value={draft.price ?? ""} onChange={(event) => update({ price: event.target.value ? Number(event.target.value) : null })} /></EditField>{draft.priceRaw && <p>Исходное значение: {draft.priceRaw}</p>}
              <EditField label="Тип"><select value={draft.category} onChange={(event) => update({ category: event.target.value as PropertyListing["category"] })}><option>Квартира</option><option>Дом</option><option>Участок</option><option>Коммерция</option></select></EditField>
              <EditField label="Рынок"><select value={draft.market} disabled={Boolean(draft.sourceSheet)} onChange={(event) => update({ market: event.target.value as PropertyListing["market"] })}><option>Первичный</option><option>Вторичный</option></select></EditField>
              <EditField label="Площадь"><input inputMode="decimal" value={draft.area ?? ""} onChange={(event) => update({ area: event.target.value ? Number(event.target.value) : null })} /></EditField>{draft.areaRaw && <p>Исходное значение: {draft.areaRaw}</p>}
              <EditField label="Комнаты"><input value={draft.rooms || ""} onChange={(event) => update({ rooms: event.target.value || undefined })} /></EditField>
              <EditField label="Этаж"><input inputMode="numeric" value={draft.floor ?? ""} onChange={(event) => update({ floor: event.target.value ? Number(event.target.value) : undefined })} /></EditField>
              <EditField label="Этажность"><input inputMode="numeric" value={draft.totalFloors ?? ""} onChange={(event) => update({ totalFloors: event.target.value ? Number(event.target.value) : undefined })} /></EditField>
              <EditField label="Участок, сот."><input inputMode="decimal" value={draft.landArea ?? ""} onChange={(event) => update({ landArea: event.target.value ? Number(event.target.value) : undefined })} /></EditField>
            </section>
            <section className={styles.factSection}>
              <h3>Расположение</h3>
              <EditField label="Адрес"><input value={draft.address} onChange={(event) => update({ address: event.target.value })} /></EditField>
              <EditField label="Район"><input value={draft.district} onChange={(event) => update({ district: event.target.value })} /></EditField>
            </section>
            {draft.market === "Первичный" ? <section className={styles.factSection}><h3>Новостройка</h3><EditField label="Жилой комплекс"><input value={draft.project || ""} onChange={(event) => update({ project: event.target.value || undefined })} /></EditField><EditField label="Застройщик"><input value={draft.developer || ""} onChange={(event) => update({ developer: event.target.value || undefined })} /></EditField></section> : <><section className={styles.factSection}><h3>Вторичный объект</h3>
              <EditField label="ЖК / дом"><input value={draft.buildingLabel ?? ""} onChange={(event) => update({ buildingLabel: event.target.value })} /></EditField>
              <EditField label="Секция / квартира"><input value={draft.unitDetail ?? ""} onChange={(event) => update({ unitDetail: event.target.value })} /></EditField>
              <EditField label="Подтип"><input value={draft.subtype ?? ""} onChange={(event) => update({ subtype: event.target.value })} /></EditField>
              <EditField label="Состояние"><input value={draft.condition ?? ""} onChange={(event) => update({ condition: event.target.value })} /></EditField>
              <EditField label="Документы"><textarea value={draft.documentNotes ?? ""} onChange={(event) => update({ documentNotes: event.target.value })} /></EditField>
            </section><section className={styles.factSection}><h3>Собственник</h3><p>Контакты собственника хранятся в объекте отдельно от лидов.</p>
              <EditField label="Имя"><input value={draft.ownerName ?? ""} onChange={(event) => update({ ownerName: event.target.value })} /></EditField>
              <EditField label="Контакты"><textarea value={draft.ownerContacts ?? ""} onChange={(event) => update({ ownerContacts: event.target.value })} /></EditField>
            </section><section className={styles.factSection}><h3>Ответственный за объект</h3>
              <EditField label="Сотрудник"><select value={draft.assigneeId ?? ""} onChange={(event) => update({ assigneeId: event.target.value || null })}><option value="">Назначить позже</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></EditField>
              <EditField label="Комментарий"><input value={draft.assignmentNote ?? ""} onChange={(event) => update({ assignmentNote: event.target.value })} /></EditField>
            </section></>}
            {events.length > 0 && <section className={styles.factSection}><h3>История объекта</h3>{events.map((event) => <p key={event.id}><strong>{event.title}</strong> · {event.description} · {new Date(event.createdAt).toLocaleString("ru-RU")}</p>)}</section>}
            {error && <p className={styles.saveError}>{error}</p>}
            <div className={styles.saveActions}><button type="button" onClick={onClose}>Отмена</button><button className={styles.offerButton} type="button" disabled={!draft.title.trim() || saving} onClick={() => { void save(); }}>{saving ? "Сохраняем…" : "Сохранить"}</button></div>
            </>}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ReadOnlyFacts({ property }: { property: PropertyListing }) {
  return <>
    <section className={styles.factSection}><h3>Основное</h3><Fact label="Тип" value={property.category} /><Fact label="Рынок" value={property.market} /><Fact label="Комнаты" value={property.rooms || "—"} /><Fact label="Площадь" value={property.area === null ? "—" : `${property.area} м²`} />{property.floor && <Fact label="Этаж" value={`${property.floor} из ${property.totalFloors || "—"}`} />}{property.landArea && <Fact label="Участок" value={`${property.landArea} сот.`} />}</section>
    <section className={styles.factSection}><h3>Расположение</h3><Fact label="Адрес" value={property.address} /><Fact label="Район" value={property.district} /></section>
    <p className={styles.demoNotice}>Это демонстрационная карточка. После импорта здесь появятся данные объекта из базы агентства.</p>
  </>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className={styles.fact}><span>{label}</span><strong>{value}</strong></div>;
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.editField}><span>{label}</span>{children}</label>;
}

function formatPrice(property: Pick<PropertyListing, "price" | "currency" | "operation">) {
  const symbol = property.currency === "USD" ? "$" : property.currency === "EUR" ? "€" : "₴";
  if (property.price === null) return "Цена не указана";
  const value = new Intl.NumberFormat("ru-RU").format(property.price);
  return property.operation === "Аренда" ? `${symbol}${value} / мес.` : `${symbol}${value}`;
}
