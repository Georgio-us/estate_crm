import { useState } from "react";
import type { Deal } from "@/types/crm";
import styles from "./contacts.module.css";

export interface NewContactDraft { name: string; phone: string; email: string; telegram: string; source: Deal["source"]; assigneeId: string; comment: string; }

export function NewContactModal({ onCreate, onClose, assignees }: { onCreate: (draft: NewContactDraft) => Promise<void>; onClose: () => void; assignees: Array<{ id: string; name: string }> }) {
  const [draft, setDraft] = useState<NewContactDraft>({ name: "", phone: "", email: "", telegram: "", source: "Manual", assigneeId: "", comment: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const update = (patch: Partial<NewContactDraft>) => setDraft((current) => ({ ...current, ...patch }));

  async function submit() {
    if (!draft.name.trim() || isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      await onCreate(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать контакт.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.modalLayer}>
      <button className={styles.backdrop} type="button" onClick={isSubmitting ? undefined : onClose} aria-label="Закрыть создание контакта" />
      <form className={styles.modal} onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { const target = event.target as HTMLElement; if (event.key === "Enter" && target.tagName !== "TEXTAREA" && target.getAttribute("type") !== "submit") event.preventDefault(); }}>
        <header><div><span>Новый контакт</span><h2>Добавить человека или компанию</h2></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header>
        <div className={styles.modalBody}>
          <Field label="Имя или название" required><input autoFocus aria-label="Имя или название" value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="Например, Мария Иванова" /></Field>
          <div className={styles.formGrid}><Field label="Телефон"><input value={draft.phone} onChange={(event) => update({ phone: event.target.value })} placeholder="+38 000 000 00 00" /></Field><Field label="Telegram"><input value={draft.telegram} onChange={(event) => update({ telegram: event.target.value })} placeholder="@username" /></Field></div>
          <Field label="Email"><input type="email" value={draft.email} onChange={(event) => update({ email: event.target.value })} placeholder="name@example.com" /></Field>
          <div className={styles.formGrid}><Field label="Источник"><input value="Вручную" readOnly /></Field><Field label="Ответственный"><select value={draft.assigneeId} onChange={(event) => update({ assigneeId: event.target.value })}><option value="">Не назначен</option>{assignees.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field></div>
          <Field label="Комментарий"><textarea value={draft.comment} onChange={(event) => update({ comment: event.target.value })} placeholder="Контекст знакомства или важная информация" /></Field>
          {error && <p className={styles.modalError} role="alert">{error}</p>}
        </div>
        <footer><span>Сделку можно создать позднее из карточки контакта</span><div><button type="button" onClick={onClose} disabled={isSubmitting}>Отмена</button><button className={styles.primaryButton} type="submit" disabled={!draft.name.trim() || isSubmitting}>{isSubmitting ? "Создаём…" : "Создать контакт"}</button></div></footer>
      </form>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <label className={styles.field}><span>{label}{required && <b>обязательно</b>}</span>{children}</label>; }
