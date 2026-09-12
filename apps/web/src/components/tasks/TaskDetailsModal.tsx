"use client";

import { useState, type ReactNode } from "react";
import { localDateKey, taskDueLabel, taskPeriod } from "@/lib/tasks";
import type { CrmTask, CrmTaskType } from "@/types/crm";
import type { TaskAssigneeOption, TaskContactOption, TaskDealOption } from "./TasksContext";
import styles from "./tasks.module.css";

export function TaskDetailsModal({ task, contacts, deals, assignees, taskTypes, currentUserId, onSave, onClose }: { task: CrmTask; contacts: TaskContactOption[]; deals: TaskDealOption[]; assignees: TaskAssigneeOption[]; taskTypes: CrmTaskType[]; currentUserId: string; onSave: (task: CrmTask) => Promise<unknown>; onClose: () => void }) {
  const [draft, setDraft] = useState({
    title: task.title,
    kind: task.kind,
    taskTypeId: task.taskTypeId || "",
    date: task.dueDate || localDateKey(),
    time: task.dueTime || "",
    assigneeId: task.assigneeId || currentUserId,
    contactId: task.contactId || "",
    dealId: task.dealId || "",
    status: task.period === "completed" ? "completed" : "active",
    result: task.result || "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));

  async function submit() {
    if (!draft.title.trim() || !draft.date) return;
    const completed = draft.status === "completed";
    setIsSaving(true);
    setError("");
    const contact = contacts.find((item) => item.id === draft.contactId);
    const deal = deals.find((item) => item.id === draft.dealId);
    try { await onSave({
      ...task,
      title: draft.title.trim(),
      kind: draft.kind,
      taskTypeId: draft.taskTypeId || undefined,
      taskTypeName: taskTypes.find((item) => item.id === draft.taskTypeId)?.name || task.taskTypeName || task.kind,
      dueDate: draft.date,
      dueLabel: taskDueLabel(draft.date),
      dueTime: draft.time || undefined,
      assigneeId: draft.assigneeId,
      assignee: assignees.find((assignee) => assignee.id === draft.assigneeId)?.name || task.assignee,
      contactId: contact?.id,
      contactName: contact?.name,
      dealId: deal?.id,
      dealNumber: deal?.number,
      dealTitle: deal?.title,
      period: taskPeriod(draft.date, completed),
      result: completed ? draft.result.trim() || "Выполнено" : undefined,
      completedAt: completed ? task.completedAt || "Только что" : undefined,
    }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить задачу."); setIsSaving(false); }
  }

  return (
    <div className={styles.modalLayer} role="presentation">
      <button className={styles.backdrop} type="button" aria-label="Закрыть карточку задачи" onClick={onClose} />
      <form className={`${styles.newTaskModal} ${styles.taskDetailsModal}`} role="dialog" aria-modal="true" aria-labelledby="task-details-title" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <header><div><span>Карточка задачи</span><h2 id="task-details-title">Редактирование задачи</h2></div><button type="button" aria-label="Закрыть" onClick={onClose}>×</button></header>
        <div className={styles.newTaskBody}>
          <Field label="Что необходимо сделать" required><input autoFocus value={draft.title} onChange={(event) => update({ title: event.target.value })} /></Field>
          <div className={styles.formGrid}>
            <Field label="Дата"><input type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} /></Field>
            <Field label="Время"><input type="time" value={draft.time} onChange={(event) => update({ time: event.target.value })} /></Field>
            <Field label="Тип действия"><select value={draft.taskTypeId} onChange={(event) => { const taskType = taskTypes.find((item) => item.id === event.target.value); if (taskType) update({ taskTypeId: taskType.id, kind: taskType.baseKind }); }}>{!task.taskTypeId && <option value="">{task.taskTypeName || task.kind}</option>}{taskTypes.filter((item) => item.isActive || item.id === task.taskTypeId).map((item) => <option value={item.id} key={item.id}>{item.name}{!item.isActive ? " · в архиве" : ""}</option>)}</select></Field>
            <Field label="Ответственный"><select value={draft.assigneeId} onChange={(event) => update({ assigneeId: event.target.value })}>{assignees.map((assignee) => <option value={assignee.id} key={assignee.id}>{assignee.name}</option>)}</select></Field>
            <Field label="Статус"><select value={draft.status} onChange={(event) => update({ status: event.target.value })}><option value="active">Запланирована</option><option value="completed">Выполнена</option></select></Field>
          </div>
          <Field label="Контакт"><select value={draft.contactId} onChange={(event) => update({ contactId: event.target.value, dealId: "" })}><option value="">Без контакта</option>{contacts.map((contact) => <option value={contact.id} key={contact.id}>{contact.name}</option>)}</select></Field>
          <Field label="Сделка"><select value={draft.dealId} onChange={(event) => { const deal = deals.find((item) => item.id === event.target.value); update({ dealId: deal?.id || "", contactId: deal?.contactId || draft.contactId }); }}><option value="">Без сделки</option>{deals.filter((deal) => !draft.contactId || deal.contactId === draft.contactId).map((deal) => <option value={deal.id} key={deal.id}>#{deal.number} · {deal.title}</option>)}</select></Field>
          {draft.status === "completed" && <Field label="Результат"><textarea value={draft.result} onChange={(event) => update({ result: event.target.value })} placeholder="Что сделано или о чём договорились" /></Field>}
          {error && <p className={styles.modalError}>{error}</p>}
        </div>
        <footer><button type="button" onClick={onClose}>Отмена</button><button className={styles.primaryButton} type="submit" disabled={!draft.title.trim() || !draft.date || isSaving}>{isSaving ? "Сохраняем…" : "Сохранить"}</button></footer>
      </form>
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className={styles.field}><span>{label}{required && <b>обязательно</b>}</span>{children}</label>;
}
