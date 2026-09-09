import { useState, type ReactNode } from "react";
import type { PropertyListing } from "@/types/crm";
import styles from "./properties.module.css";

export function PropertyDrawer({ property, onSave, onClose, readOnly = false }: { property: PropertyListing; onSave: (property: PropertyListing) => Promise<void>; onClose: () => void; readOnly?: boolean }) {
  const [draft, setDraft] = useState(property);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (patch: Partial<PropertyListing>) => setDraft((current) => ({ ...current, ...patch }));

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
            <div className={styles.heroImage} role="img" aria-label={`Фото: ${property.title}`} style={{ backgroundImage: `url("${property.imageUrl}")` }} />
            <div className={styles.thumbnailRow}><span style={{ backgroundImage: `url("${property.imageUrl}")` }} />{!readOnly && <button type="button">＋ Добавить фото</button>}</div>
            <section className={styles.description}><h3>Описание</h3>{readOnly ? <p>{draft.description}</p> : <textarea className={styles.drawerTextarea} value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Описание объекта" />}</section>
          </div>
          <div className={styles.propertyPane}>
            <div className={styles.priceBlock}><span>{draft.operation}</span><strong>{formatPrice(draft)}</strong><span className={`${styles.status} ${styles[`status_${draft.status}`]}`}>{draft.status}</span></div>
            {readOnly ? <ReadOnlyFacts property={draft} /> : <><section className={styles.factSection}>
              <h3>Основное</h3>
              <EditField label="Название"><input value={draft.title} onChange={(event) => update({ title: event.target.value })} /></EditField>
              <EditField label="Статус"><select value={draft.status} onChange={(event) => update({ status: event.target.value as PropertyListing["status"] })}><option>Доступен</option><option>Резерв</option><option>Продан</option></select></EditField>
              <EditField label="Операция"><select value={draft.operation} onChange={(event) => update({ operation: event.target.value as PropertyListing["operation"] })}><option>Продажа</option><option>Аренда</option></select></EditField>
              <EditField label="Цена"><input inputMode="decimal" value={draft.price} onChange={(event) => update({ price: Number(event.target.value) || 0 })} /></EditField>
              <EditField label="Тип"><select value={draft.category} onChange={(event) => update({ category: event.target.value as PropertyListing["category"] })}><option>Квартира</option><option>Дом</option><option>Участок</option><option>Коммерция</option></select></EditField>
              <EditField label="Рынок"><select value={draft.market} onChange={(event) => update({ market: event.target.value as PropertyListing["market"] })}><option>Первичный</option><option>Вторичный</option></select></EditField>
              <EditField label="Площадь"><input inputMode="decimal" value={draft.area} onChange={(event) => update({ area: Number(event.target.value) || 0 })} /></EditField>
              <EditField label="Комнаты"><input value={draft.rooms || ""} onChange={(event) => update({ rooms: event.target.value || undefined })} /></EditField>
            </section>
            <section className={styles.factSection}>
              <h3>Расположение</h3>
              <EditField label="Адрес"><input value={draft.address} onChange={(event) => update({ address: event.target.value })} /></EditField>
              <EditField label="Район"><input value={draft.district} onChange={(event) => update({ district: event.target.value })} /></EditField>
            </section>
            <section className={styles.factSection}><h3>Новостройка</h3><EditField label="Жилой комплекс"><input value={draft.project || ""} onChange={(event) => update({ project: event.target.value || undefined })} /></EditField><EditField label="Застройщик"><input value={draft.developer || ""} onChange={(event) => update({ developer: event.target.value || undefined })} /></EditField></section>
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
    <section className={styles.factSection}><h3>Основное</h3><Fact label="Тип" value={property.category} /><Fact label="Рынок" value={property.market} /><Fact label="Комнаты" value={property.rooms || "—"} /><Fact label="Площадь" value={`${property.area} м²`} />{property.floor && <Fact label="Этаж" value={`${property.floor} из ${property.totalFloors || "—"}`} />}{property.landArea && <Fact label="Участок" value={`${property.landArea} сот.`} />}</section>
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
  const symbol = property.currency === "USD" ? "$" : "€";
  const value = new Intl.NumberFormat("ru-RU").format(property.price);
  return property.operation === "Аренда" ? `${symbol}${value} / мес.` : `${symbol}${value}`;
}
