import Link from "next/link";
import { useState, type ReactNode } from "react";
import { localDateKey } from "@/lib/tasks";
import type { TaskKind } from "@/types/crm";
import type { TaskAssigneeOption, TaskContactOption, TaskDealOption, TaskDraftInput } from "./TasksContext";
import styles from "./tasks.module.css";

export type NewTaskDraft = TaskDraftInput;

interface NewTaskModalProps {
  contacts: TaskContactOption[];
  deals: TaskDealOption[];
  assignees: TaskAssigneeOption[];
  currentUserId: string;
  initialDate?: string;
  initialContactId?: string;
  initialDealId?: string;
  onCreate: (draft: NewTaskDraft) => Promise<unknown>;
  onClose: () => void;
}

export function NewTaskModal({ contacts, deals, assignees, currentUserId, initialDate, initialContactId, initialDealId, onCreate, onClose }: NewTaskModalProps) {
  const initialDeal = deals.find((deal) => deal.id === initialDealId);
  const initialContactDeals = initialContactId ? deals.filter((deal) => deal.contactId === initialContactId) : [];
  const [draft, setDraft] = useState<NewTaskDraft>({ title: "", kind: "Звонок", dueDate: initialDate || localDateKey(), dueTime: "", assigneeId: currentUserId, contactId: initialContactId || initialDeal?.contactId, dealId: initialDealId || (initialContactDeals.length === 1 ? initialContactDeals[0].id : undefined) });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const update = (patch: Partial<NewTaskDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const availableDeals = draft.contactId ? deals.filter((deal) => deal.contactId === draft.contactId) : deals;

  async function submit() {
    if (!draft.title.trim() || !draft.dueDate || !draft.dealId || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try { await onCreate({ ...draft, title: draft.title.trim() }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось создать задачу."); setIsSubmitting(false); }
  }

  return <div className={styles.modalLayer}><button className={styles.backdrop} type="button" onClick={isSubmitting ? undefined : onClose} aria-label="Закрыть создание задачи" /><form className={styles.newTaskModal} onSubmit={(event) => { event.preventDefault(); void submit(); }} onKeyDown={(event) => { const target = event.target as HTMLElement; if (event.key === "Enter" && target.tagName !== "TEXTAREA" && target.getAttribute("type") !== "submit") event.preventDefault(); }}><header><div><span>Новая задача</span><h2>Запланировать действие</h2></div><button type="button" onClick={onClose} aria-label="Закрыть">×</button></header><div className={styles.newTaskBody}><Field label="Что необходимо сделать" required><input autoFocus aria-label="Что необходимо сделать" value={draft.title} onChange={(event) => update({ title: event.target.value })} placeholder="Например, позвонить клиенту" /></Field><div className={styles.formGrid}><Field label="Тип действия"><select value={draft.kind} onChange={(event) => update({ kind: event.target.value as TaskKind })}><option>Звонок</option><option>Встреча</option><option>Сообщение</option><option>Другое</option></select></Field><Field label="Ответственный"><select value={draft.assigneeId} onChange={(event) => update({ assigneeId: event.target.value })}>{assignees.map((assignee) => <option value={assignee.id} key={assignee.id}>{assignee.name}</option>)}</select></Field><Field label="Дата"><input type="date" value={draft.dueDate || ""} onChange={(event) => update({ dueDate: event.target.value })} /></Field><Field label="Время"><input type="time" value={draft.dueTime || ""} onChange={(event) => update({ dueTime: event.target.value })} /></Field></div><Field label="Контакт"><select value={draft.contactId || ""} onChange={(event) => { const contactId = event.target.value || undefined; const contactDeals = contactId ? deals.filter((deal) => deal.contactId === contactId) : []; update({ contactId, dealId: contactDeals.length === 1 ? contactDeals[0].id : undefined }); }}><option value="">Выберите контакт через сделку</option>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</option>)}</select></Field><Field label="Сделка" required><select value={draft.dealId || ""} onChange={(event) => { const deal = deals.find((item) => item.id === event.target.value); update({ dealId: deal?.id, contactId: deal?.contactId || draft.contactId }); }}><option value="">Выберите сделку</option>{availableDeals.map((deal) => <option value={deal.id} key={deal.id}>#{deal.number} · {deal.title}</option>)}</select></Field>{draft.contactId && !availableDeals.length && <div className={styles.dealRequired}><div><strong>У контакта пока нет сделки</strong><span>Сначала создайте сделку — задача будет связана и с ней, и с контактом.</span></div><Link href={`/?newDealContact=${draft.contactId}`}>Создать сделку →</Link></div>}{!draft.dealId && availableDeals.length > 1 && <p className={styles.relationHint}>Выберите сделку, в рамках которой выполняется задача.</p>}{error && <p className={styles.modalError}>{error}</p>}</div><footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.primaryButton} type="submit" disabled={!draft.title.trim() || !draft.dueDate || !draft.dealId || isSubmitting}>{isSubmitting ? "Создаём…" : "Создать задачу"}</button></footer></form></div>;
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) { return <label className={styles.field}><span>{label}{required && <b>обязательно</b>}</span>{children}</label>; }
