import { useState, type ReactNode } from "react";
import type { PropertyCategory, PropertyMarket } from "@/types/crm";
import styles from "./properties.module.css";

export interface NewPropertyDraft {
  title: string; address: string; district: string; category: PropertyCategory; market: PropertyMarket;
  operation: "Продажа" | "Аренда"; price: string; rooms: string; area: string; project: string; developer: string; description: string;
}

export function NewPropertyModal({ onCreate, onClose }: { onCreate: (draft: NewPropertyDraft) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<NewPropertyDraft>({ title: "", address: "", district: "Приморский", category: "Квартира", market: "Вторичный", operation: "Продажа", price: "", rooms: "", area: "", project: "", developer: "", description: "" });
  const update = (patch: Partial<NewPropertyDraft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <div className={styles.modalLayer}>
      <button className={styles.drawerBackdrop} type="button" onClick={onClose} aria-label="Закрыть создание объекта" />
      <form
        className={styles.modal}
        onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onCreate({ ...draft, title: draft.title.trim() }); }}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.key === "Enter" && target.tagName !== "TEXTAREA" && target.getAttribute("type") !== "submit") event.preventDefault();
        }}
      >
        <header><div><span>Новый объект</span><h2>Добавить недвижимость</h2></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
        <div className={styles.modalBody}>
          <Field label="Название объекта" required><input autoFocus aria-label="Название объекта" value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="Например, 2-комнатная на Французском бульваре" /></Field>
          <div className={styles.formGrid}>
            <Field label="Тип"><select value={draft.category} onChange={(event) => update({ category: event.target.value as PropertyCategory })}><option>Квартира</option><option>Дом</option><option>Участок</option><option>Коммерция</option></select></Field>
            <Field label="Рынок"><select value={draft.market} onChange={(event) => update({ market: event.target.value as PropertyMarket })}><option>Первичный</option><option>Вторичный</option></select></Field>
            <Field label="Операция"><select value={draft.operation} onChange={(event) => update({ operation: event.target.value as "Продажа" | "Аренда" })}><option>Продажа</option><option>Аренда</option></select></Field>
            <Field label="Район"><select value={draft.district} onChange={(event) => update({ district: event.target.value })}><option>Приморский</option><option>Киевский</option><option>Пересыпский</option><option>Хаджибейский</option></select></Field>
            <Field label="Цена, USD"><input inputMode="numeric" value={draft.price} onChange={(event) => update({ price: event.target.value })} placeholder="120000" /></Field>
            <Field label="Площадь, м²"><input inputMode="decimal" value={draft.area} onChange={(event) => update({ area: event.target.value })} placeholder="72.5" /></Field>
            {(draft.category === "Квартира" || draft.category === "Дом") && <Field label="Комнаты"><select value={draft.rooms} onChange={(event) => update({ rooms: event.target.value })}><option value="">Не указано</option><option>1</option><option>2</option><option>3</option><option>4+</option></select></Field>}
          </div>
          <Field label="Адрес"><input value={draft.address} onChange={(event) => update({ address: event.target.value })} placeholder="Улица и номер дома" /></Field>
          {draft.market === "Первичный" && <div className={styles.formGrid}><Field label="Жилой комплекс"><input value={draft.project} onChange={(event) => update({ project: event.target.value })} placeholder="Название ЖК" /></Field><Field label="Застройщик"><input value={draft.developer} onChange={(event) => update({ developer: event.target.value })} placeholder="Компания" /></Field></div>}
          <Field label="Описание"><textarea value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Краткое описание объекта" /></Field>
        </div>
        <footer><span>Обязательным остаётся только название</span><div><button type="button" onClick={onClose}>Отмена</button><button className={styles.primaryButton} type="submit" disabled={!draft.title.trim()}>Создать объект</button></div></footer>
      </form>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className={styles.field}><span>{label}{required && <b>обязательно</b>}</span>{children}</label>;
}
