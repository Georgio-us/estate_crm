"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { TaskKindIcon, UiIcon } from "@/components/ui/UiIcon";
import { localDateKey } from "@/lib/tasks";
import type { CrmTask, TaskKind, TaskPeriod } from "@/types/crm";
import { CompleteTaskModal } from "./CompleteTaskModal";
import { NewTaskModal, type NewTaskDraft } from "./NewTaskModal";
import { TaskDetailsModal } from "./TaskDetailsModal";
import { useTasks } from "./TasksContext";
import styles from "./tasks.module.css";

type PeriodFilter = "active" | TaskPeriod;

const periodLabels: Record<TaskPeriod, string> = {
  overdue: "Просрочено",
  today: "Сегодня",
  upcoming: "Предстоящие",
  completed: "Выполненные",
};

export function TasksCenter() {
  const user = useCurrentUser();
  const { tasks, contacts, deals, assignees, loadState, createTask, updateTask, completeTask: persistCompleteTask, reloadTasks } = useTasks();
  const [period, setPeriod] = useState<PeriodFilter>("active");
  const [assignee, setAssignee] = useState("all");
  const [kind, setKind] = useState<"all" | TaskKind>("all");
  const [search, setSearch] = useState("");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("task"));
  const [isCreating, setIsCreating] = useState(false);

  const completingTask = tasks.find((task) => task.id === completingId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const counts = useMemo(() => ({
    active: tasks.filter((task) => task.period !== "completed").length,
    overdue: tasks.filter((task) => task.period === "overdue").length,
    today: tasks.filter((task) => task.period === "today").length,
    upcoming: tasks.filter((task) => task.period === "upcoming").length,
    completed: tasks.filter((task) => task.period === "completed").length,
  }), [tasks]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return tasks.filter((task) => {
      const periodMatch = period === "active" ? task.period !== "completed" : task.period === period;
      const searchMatch = !query || [task.title, task.contactName, task.dealTitle].some((value) => value?.toLocaleLowerCase("ru").includes(query));
      return periodMatch && searchMatch && (assignee === "all" || task.assignee === assignee) && (kind === "all" || task.kind === kind);
    });
  }, [assignee, kind, period, search, tasks]);

  const groupedTasks = useMemo(() => {
    const order: TaskPeriod[] = period === "completed" ? ["completed"] : ["overdue", "today", "upcoming"];
    return order.map((key) => ({ period: key, tasks: visibleTasks.filter((task) => task.period === key) })).filter((group) => group.tasks.length);
  }, [period, visibleTasks]);

  async function completeTask(result: string) {
    if (!completingTask) return;
    await persistCompleteTask(completingTask.id, result);
    setCompletingId(null);
  }

  async function createNewTask(draft: NewTaskDraft) {
    await createTask(draft);
    setIsCreating(false);
    setPeriod("active");
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Задачи</h1>
        <label className={styles.search}><UiIcon name="search" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Задача, контакт или сделка" /></label>
        <button className={styles.primaryButton} type="button" aria-label="Новая задача" onClick={() => setIsCreating(true)}>
          <span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новая задача</span>
        </button>
      </header>

      <div className={styles.content}>
        <div className={styles.heading}><div><span className={styles.eyebrow}>Рабочий день</span><h2>Мои задачи</h2><p>Все запланированные действия по клиентам и сделкам</p></div><div className={styles.today}><span>Сегодня</span><strong>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date())}</strong></div></div>

        <div className={styles.summary}>
          <SummaryButton label="Активные" count={counts.active} active={period === "active"} onClick={() => setPeriod("active")} />
          <SummaryButton label="Просрочено" count={counts.overdue} active={period === "overdue"} tone="danger" onClick={() => setPeriod("overdue")} />
          <SummaryButton label="Сегодня" count={counts.today} active={period === "today"} tone="warning" onClick={() => setPeriod("today")} />
          <SummaryButton label="Предстоящие" count={counts.upcoming} active={period === "upcoming"} onClick={() => setPeriod("upcoming")} />
          <SummaryButton label="Выполненные" count={counts.completed} active={period === "completed"} tone="success" onClick={() => setPeriod("completed")} />
        </div>

        <div className={styles.filters}>
          <label><span>Ответственный</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="all">Все</option>{assignees.map((item) => <option key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Тип</span><select value={kind} onChange={(event) => setKind(event.target.value as "all" | TaskKind)}><option value="all">Все действия</option><option>Звонок</option><option>Встреча</option><option>Сообщение</option><option>Другое</option></select></label>
          <span>{visibleTasks.length} задач</span>
          {(assignee !== "all" || kind !== "all" || search) && <button type="button" onClick={() => { setAssignee("all"); setKind("all"); setSearch(""); }}>Сбросить</button>}
        </div>

        <div className={styles.taskList}>
          {loadState === "loading" ? <div className={styles.empty}><span>…</span><h3>Загружаем задачи</h3><p>Получаем актуальный план из CRM.</p></div> : loadState === "error" ? <div className={styles.empty}><span>!</span><h3>Не удалось загрузить задачи</h3><p>Проверьте соединение и попробуйте ещё раз.</p><button type="button" onClick={() => { void reloadTasks(); }}>Повторить</button></div> : groupedTasks.length ? groupedTasks.map((group) => <section className={`${styles.group} ${styles[`group_${group.period}`]}`} key={group.period}><div className={styles.groupHeader}><span className={`${styles.groupDot} ${styles[`dot_${group.period}`]}`} /><h3>{periodLabels[group.period]}</h3><span>{group.tasks.length}</span></div>{group.tasks.map((task) => <TaskRow task={task} onOpen={() => setSelectedTaskId(task.id)} onComplete={() => setCompletingId(task.id)} key={task.id} />)}</section>) : <div className={styles.empty}><span>✓</span><h3>Задач не найдено</h3><p>Для выбранных параметров список пуст.</p></div>}
        </div>
      </div>

      {completingTask && <CompleteTaskModal task={completingTask} onComplete={(result) => { void completeTask(result); }} onClose={() => setCompletingId(null)} />}
      {selectedTask && <TaskDetailsModal task={selectedTask} contacts={contacts} deals={deals} assignees={assignees} currentUserId={user.id} onSave={updateTask} onClose={() => setSelectedTaskId(null)} />}
      {isCreating && <NewTaskModal initialDate={localDateKey()} contacts={contacts} deals={deals} assignees={assignees} currentUserId={user.id} onCreate={createNewTask} onClose={() => setIsCreating(false)} />}
    </section>
  );
}

function SummaryButton({ label, count, active, tone = "", onClick }: { label: string; count: number; active: boolean; tone?: string; onClick: () => void }) {
  return <button className={`${styles.summaryCard} ${active ? styles.summaryActive : ""} ${tone ? styles[`summary_${tone}`] : ""}`} type="button" onClick={onClick}><span>{label}</span><strong>{count}</strong></button>;
}

function TaskRow({ task, onOpen, onComplete }: { task: CrmTask; onOpen: () => void; onComplete: () => void }) {
  const isCompleted = task.period === "completed";
  return (
    <article className={`${styles.taskRow} ${isCompleted ? styles.taskCompleted : ""}`}>
      <button className={styles.checkButton} type="button" aria-label={isCompleted ? "Задача выполнена" : `Выполнить: ${task.title}`} disabled={isCompleted} onClick={onComplete}>{isCompleted ? "✓" : ""}</button>
      <span className={styles.kindIcon}><TaskKindIcon kind={task.kind} /></span>
      <button className={styles.taskMain} type="button" onClick={onOpen}><strong>{task.title}</strong><span>{task.kind}{task.result && ` · ${task.result}`}</span></button>
      <div className={styles.relation}>{task.contactName ? <Link href={`/contacts?contact=${task.contactId}`}>{task.contactName}</Link> : <span>Без контакта</span>}{task.dealNumber && task.dealId && <Link href={`/?deal=${task.dealId}&task=${task.id}`}>Открыть сделку #{task.dealNumber}</Link>}</div>
      <span className={styles.taskAssignee}><i>{task.assignee.slice(0, 1)}</i>{task.assignee}</span>
      <time className={task.period === "overdue" ? styles.overdueTime : ""}>{task.completedAt || <>{task.dueLabel}{task.dueTime && <b>{task.dueTime}</b>}</>}</time>
      {!isCompleted && <button className={styles.completeButton} type="button" onClick={onComplete}>Выполнить</button>}
    </article>
  );
}
