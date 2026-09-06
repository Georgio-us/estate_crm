"use client";

import { useState, type ReactNode } from "react";
import type { CrmTask, TaskKind, TaskPeriod } from "@/types/crm";
import styles from "./tasks.module.css";

const TODAY_KEY = "2026-09-05";

function periodForDate(date: string): Exclude<TaskPeriod, "completed"> {
  if (date < TODAY_KEY) return "overdue";
  if (date === TODAY_KEY) return "today";
  return "upcoming";
}

function labelForDate(date: string) {
  if (date === TODAY_KEY) return "Сегодня";
  if (date === "2026-09-06") return "Завтра";
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
}

export function TaskDetailsModal({ task, onSave, onClose }: { task: CrmTask; onSave: (task: CrmTask) => void; onClose: () => void }) {
  const [draft, setDraft] = useState({
    title: task.title,
    kind: task.kind,
    date: task.dueDate || TODAY_KEY,
    time: task.dueTime || "",
    assignee: task.assignee,
    contactName: task.contactName || "",
    dealTitle: task.dealTitle || "",
    status: task.period === "completed" ? "completed" : "active",
    result: task.result || "",
  });
  const update = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));

  function submit() {
    if (!draft.title.trim() || !draft.date) return;
    const completed = draft.status === "completed";
    onSave({
      ...task,
      title: draft.title.trim(),
      kind: draft.kind,
      dueDate: draft.date,
      dueLabel: labelForDate(draft.date),
      dueTime: draft.time || undefined,
      assignee: draft.assignee,
      contactName: draft.contactName.trim() || undefined,
      dealTitle: draft.dealTitle.trim() || undefined,
      period: completed ? "completed" : periodForDate(draft.date),
      result: completed ? draft.result.trim() || "Выполнено" : undefined,
      completedAt: completed ? task.completedAt || "Только что" : undefined,
    });
  }

  return (
    <div className={styles.modalLayer} role="presentation">
      <button className={styles.backdrop} type="button" aria-label="Закрыть карточку задачи" onClick={onClose} />
      <form className={`${styles.newTaskModal} ${styles.taskDetailsModal}`} role="dialog" aria-modal="true" aria-labelledby="task-details-title" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <header><div><span>Карточка задачи</span><h2 id="task-details-title">Редактирование задачи</h2></div><button type="button" aria-label="Закрыть" onClick={onClose}>×</button></header>
        <div className={styles.newTaskBody}>
          <Field label="Что необходимо сделать" required><input autoFocus value={draft.title} onChange={(event) => update({ title: event.target.value })} /></Field>
          <div className={styles.formGrid}>
            <Field label="Дата"><input type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} /></Field>
            <Field label="Время"><input type="time" value={draft.time} onChange={(event) => update({ time: event.target.value })} /></Field>
            <Field label="Тип действия"><select value={draft.kind} onChange={(event) => update({ kind: event.target.value as TaskKind })}><option>Звонок</option><option>Встреча</option><option>Сообщение</option><option>Другое</option></select></Field>
            <Field label="Ответственный"><select value={draft.assignee} onChange={(event) => update({ assignee: event.target.value })}><option>Георгий</option><option>Елена</option><option>Андрей</option></select></Field>
            <Field label="Статус"><select value={draft.status} onChange={(event) => update({ status: event.target.value })}><option value="active">Запланирована</option><option value="completed">Выполнена</option></select></Field>
          </div>
          <Field label="Контакт"><input value={draft.contactName} onChange={(event) => update({ contactName: event.target.value })} placeholder="Имя клиента — необязательно" /></Field>
          <Field label="Сделка"><input value={draft.dealTitle} onChange={(event) => update({ dealTitle: event.target.value })} placeholder="Связанная сделка — необязательно" /></Field>
          {draft.status === "completed" && <Field label="Результат"><textarea value={draft.result} onChange={(event) => update({ result: event.target.value })} placeholder="Что сделано или о чём договорились" /></Field>}
        </div>
        <footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.primaryButton} type="submit" disabled={!draft.title.trim() || !draft.date}>Сохранить</button></footer>
      </form>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className={styles.field}><span>{label}{required && <b>обязательно</b>}</span>{children}</label>;
}
