import type { CrmTask, TaskPeriod } from "@/types/crm";

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function taskPeriod(dueDate: string | null | undefined, completed = false): TaskPeriod {
  if (completed) return "completed";
  if (!dueDate) return "upcoming";
  const today = localDateKey();
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return "upcoming";
}

export function taskDueLabel(dueDate: string | null | undefined) {
  if (!dueDate) return "Без срока";
  const today = localDateKey();
  const now = new Date();
  const tomorrow = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (dueDate === today) return "Сегодня";
  if (dueDate === tomorrow) return "Завтра";
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(year!, month! - 1, day!));
}

export interface ApiTask {
  id: string;
  title: string;
  kind: "CALL" | "MEETING" | "MESSAGE" | "OTHER";
  status: "ACTIVE" | "COMPLETED";
  dueDate: string | null;
  dueTime: string | null;
  result: string | null;
  completedAt: string | null;
  contact: { id: string; name: string } | null;
  deal: { id: string; number: number; title: string } | null;
  assignee: { id: string; name: string } | null;
}

const kindFromApi = { CALL: "Звонок", MEETING: "Встреча", MESSAGE: "Сообщение", OTHER: "Другое" } as const;
export const kindToApi = { Звонок: "CALL", Встреча: "MEETING", Сообщение: "MESSAGE", Другое: "OTHER" } as const;

export function mapApiTask(task: ApiTask): CrmTask {
  return {
    id: task.id,
    title: task.title,
    kind: kindFromApi[task.kind],
    period: taskPeriod(task.dueDate, task.status === "COMPLETED"),
    dueDate: task.dueDate || undefined,
    dueLabel: taskDueLabel(task.dueDate),
    dueTime: task.dueTime || undefined,
    assigneeId: task.assignee?.id,
    assignee: task.assignee?.name || "Не назначен",
    contactId: task.contact?.id,
    contactName: task.contact?.name,
    dealId: task.deal?.id,
    dealNumber: task.deal?.number,
    dealTitle: task.deal?.title,
    result: task.result || undefined,
    completedAt: task.completedAt ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(task.completedAt)) : undefined,
  };
}
