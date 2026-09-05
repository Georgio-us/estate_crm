import { useState } from "react";
import type { Deal } from "@/types/crm";
import styles from "./contacts.module.css";

export interface NewContactDraft { name: string; phone: string; email: string; telegram: string; source: Deal["source"]; assignee: string; comment: string; }

export function NewContactModal({ onCreate, onClose }: { onCreate: (draft: NewContactDraft) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<NewContactDraft>({ name: "", phone: "", email: "", telegram: "", source: "Manual", assignee: "Не назначен", comment: "" });
  const update = (patch: Partial<NewContactDraft>) => setDraft((current) => ({ ...current, ...patch }));
  return (
    <div className={styles.modalLayer}>
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Закрыть создание контакта" />
      <form className={styles.modal} onSubmit={(event) => { event.preventDefault(); if (draft.name.trim()) onCreate(draft); }} onKeyDown={(event) => { const target = event.target as HTMLElement; if (event.key === "Enter" && target.tagName !== "TEXTAREA" && target.getAttribute("type") !== "submit") event.preventDefault(); }}>
        <header><div><span>Новый контакт</span><h2>Добавить человека или компанию</h2></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
        <div className={styles.modalBody}>
          <Field label="Имя или название" required><input autoFocus aria-label="Имя или название" value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="Например, Мария Иванова" /></Field>
          <div className={styles.formGrid}><Field label="Телефон"><input value={draft.phone} onChange={(event) => update({ phone: event.target.value })} placeholder="+38 000 000 00 00" /></Field><Field label="Telegram"><input value={draft.telegram} onChange={(event) => update({ telegram: event.target.value })} placeholder="@username" /></Field></div>
          <Field label="Email"><input type="email" value={draft.email} onChange={(event) => update({ email: event.target.value })} placeholder="name@example.com" /></Field>
          <div className={styles.formGrid}><Field label="Источник"><input value="Вручную" readOnly /></Field><Field label="Ответственный"><select value={draft.assignee} onChange={(event) => update({ assignee: event.target.value })}><option>Не назначен</option><option>Георгий</option><option>Елена</option><option>Андрей</option></select></Field></div>
          <Field label="Комментарий"><textarea value={draft.comment} onChange={(event) => update({ comment: event.target.value })} placeholder="Контекст знакомства или важная информация" /></Field>
        </div>
        <footer><span>Сделку можно создать позднее из карточки контакта</span><div><button type="button" onClick={onClose}>Отмена</button><button className={styles.primaryButton} type="submit" disabled={!draft.name.trim()}>Создать контакт</button></div></footer>
      </form>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className={styles.field}><span>{label}{required && <b>обязательно</b>}</span>{children}</label>; }
