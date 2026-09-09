"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { useTasks } from "@/components/tasks/TasksContext";
import { NewTaskModal } from "@/components/tasks/NewTaskModal";
import { TaskDetailsModal } from "@/components/tasks/TaskDetailsModal";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
import { localDateKey } from "@/lib/tasks";
import type { TaskKind } from "@/types/crm";
import styles from "./calendar.module.css";

type CalendarMode = "month" | "week";

const TODAY_KEY = localDateKey();
const weekDayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const kindIcons: Record<TaskKind, string> = { Звонок: "☎", Встреча: "□", Сообщение: "↗", Другое: "✓" };
const kindTone: Record<TaskKind, string> = { Звонок: "call", Встреча: "meeting", Сообщение: "message", Другое: "other" };

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function startOfWeek(date: Date) {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekGrid(selected: Date) {
  const start = startOfWeek(selected);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function formatFullDate(key: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(dateFromKey(key));
}

export function CalendarView() {
  const user = useCurrentUser();
  const { tasks, contacts, deals, assignees, createTask, updateTask, completeTask: persistCompleteTask } = useTasks();
  const [mode, setMode] = useState<CalendarMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(TODAY_KEY);
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);

  const visibleDays = useMemo(() => mode === "month" ? monthGrid(cursor) : weekGrid(dateFromKey(selectedDate)), [cursor, mode, selectedDate]);
  const filteredTasks = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru");
    return tasks.filter((task) => !query || [task.title, task.contactName, task.dealTitle, task.assignee].some((value) => value?.toLocaleLowerCase("ru").includes(query)));
  }, [search, tasks]);
  const selectedTasks = filteredTasks.filter((task) => task.dueDate === selectedDate).sort((first, second) => (first.dueTime || "99:99").localeCompare(second.dueTime || "99:99"));
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const completingTask = tasks.find((task) => task.id === completingTaskId);

  const title = mode === "month"
    ? `${monthNames[cursor.getMonth()]} ${cursor.getFullYear()}`
    : `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(visibleDays[0])} — ${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(visibleDays[6])}`;

  function move(direction: -1 | 1) {
    if (mode === "month") {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
      setCursor(next);
      setSelectedDate(dateKey(next));
      return;
    }
    const next = addDays(dateFromKey(selectedDate), direction * 7);
    setSelectedDate(dateKey(next));
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  function returnToToday() {
    setCursor(new Date());
    setSelectedDate(TODAY_KEY);
  }

  async function createCalendarTask(draft: Parameters<typeof createTask>[0]) {
    await createTask(draft);
    const date = draft.dueDate || selectedDate;
    setSelectedDate(date);
    const createdDate = dateFromKey(date);
    setCursor(new Date(createdDate.getFullYear(), createdDate.getMonth(), 1));
    setIsCreating(false);
  }

  async function completeTask(result: string) {
    if (!completingTask) return;
    await persistCompleteTask(completingTask.id, result);
    setCompletingTaskId(null);
  }

  async function saveTask(updatedTask: Parameters<typeof updateTask>[0]) {
    await updateTask(updatedTask);
    const nextDateKey = updatedTask.dueDate || selectedDate;
    const nextDate = dateFromKey(nextDateKey);
    setSelectedDate(nextDateKey);
    setCursor(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    setSelectedTaskId(null);
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Календарь</h1>
        <label className={styles.search}><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Задача, контакт или сделка" /></label>
        <button className={styles.primaryButton} type="button" aria-label="Новая задача" onClick={() => setIsCreating(true)}><span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новая задача</span></button>
      </header>

      <div className={styles.content}>
        <div className={styles.heading}>
          <div><span className={styles.eyebrow}>Планирование</span><h2>Календарь задач</h2><p>Сроки, встречи и следующие действия менеджеров</p></div>
          <div className={styles.modeSwitch} aria-label="Режим календаря"><button className={mode === "month" ? styles.activeMode : ""} type="button" onClick={() => setMode("month")}>Месяц</button><button className={mode === "week" ? styles.activeMode : ""} type="button" onClick={() => setMode("week")}>Неделя</button></div>
        </div>

        <div className={styles.calendarToolbar}>
          <div className={styles.navigation}><button type="button" aria-label="Предыдущий период" onClick={() => move(-1)}>‹</button><button type="button" onClick={returnToToday}>Сегодня</button><button type="button" aria-label="Следующий период" onClick={() => move(1)}>›</button></div>
          <h3>{title}</h3>
          <span>{filteredTasks.filter((task) => task.period !== "completed").length} активных задач</span>
        </div>

        <div className={styles.workspace}>
          <div className={styles.calendarSurface}>
            <div className={`${styles.weekdays} ${mode === "week" ? styles.weekdaysForWeek : ""}`}>{weekDayNames.map((day) => <span key={day}>{day}</span>)}</div>
            <div className={`${styles.calendarGrid} ${mode === "week" ? styles.weekGrid : ""}`}>
              {visibleDays.map((day) => {
                const key = dateKey(day);
                const dayTasks = filteredTasks.filter((task) => task.dueDate === key);
                const isAdjacent = mode === "month" && day.getMonth() !== cursor.getMonth();
                return (
                  <button className={`${styles.dayCell} ${isAdjacent ? styles.adjacentDay : ""} ${key === TODAY_KEY ? styles.todayCell : ""} ${key === selectedDate ? styles.selectedCell : ""}`} type="button" aria-label={formatFullDate(key)} onClick={() => setSelectedDate(key)} key={key}>
                    <span className={styles.dayNumber}>{day.getDate()}</span>
                    <span className={styles.mobileCount}>{dayTasks.length || ""}</span>
                    <span className={styles.dayTasks}>
                      {dayTasks.slice(0, mode === "week" ? 5 : 3).map((task) => <span className={`${styles.taskChip} ${styles[`tone_${kindTone[task.kind]}`]} ${task.period === "completed" ? styles.completedChip : ""}`} key={task.id}><i>{task.dueTime || "—"}</i><b>{task.title}</b></span>)}
                      {dayTasks.length > (mode === "week" ? 5 : 3) && <span className={styles.moreTasks}>Ещё {dayTasks.length - (mode === "week" ? 5 : 3)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className={styles.dayPanel}>
            <div className={styles.dayPanelHeader}><div><span>Выбранный день</span><h3>{formatFullDate(selectedDate)}</h3></div><button type="button" aria-label="Добавить задачу на выбранную дату" onClick={() => setIsCreating(true)}>＋</button></div>
            <div className={styles.dayAgenda}>
              {selectedTasks.length ? selectedTasks.map((task) => (
                <article className={`${styles.agendaItem} ${task.period === "completed" ? styles.completedAgenda : ""}`} key={task.id}>
                  <button className={styles.checkButton} type="button" aria-label={task.period === "completed" ? `Задача выполнена: ${task.title}` : `Выполнить задачу: ${task.title}`} disabled={task.period === "completed"} onClick={() => setCompletingTaskId(task.id)}>{task.period === "completed" ? "✓" : ""}</button>
                  <button className={styles.agendaMain} type="button" onClick={() => setSelectedTaskId(task.id)}><span><i>{kindIcons[task.kind]}</i>{task.kind}<time>{task.dueTime || "Без времени"}</time></span><strong>{task.title}</strong><small>{task.assignee}</small></button>
                  {(task.contactName || task.dealTitle) && <div className={styles.relations}>{task.contactName && <Link href={`/contacts?contact=${task.contactId}`}>{task.contactName}</Link>}{task.dealTitle && task.dealId && <Link href={`/?deal=${task.dealId}&task=${task.id}`}>Открыть сделку · {task.dealTitle}</Link>}</div>}
                </article>
              )) : <div className={styles.emptyDay}><span>○</span><h4>На этот день задач нет</h4><p>Можно оставить день свободным или запланировать действие.</p><button type="button" onClick={() => setIsCreating(true)}>＋ Добавить задачу</button></div>}
            </div>
          </aside>
        </div>
      </div>

      {isCreating && <NewTaskModal initialDate={selectedDate} contacts={contacts} deals={deals} assignees={assignees} currentUserId={user.id} onCreate={createCalendarTask} onClose={() => setIsCreating(false)} />}
      {selectedTask && <TaskDetailsModal task={selectedTask} contacts={contacts} deals={deals} assignees={assignees} currentUserId={user.id} onSave={saveTask} onClose={() => setSelectedTaskId(null)} />}
      {completingTask && <CompleteTaskModal task={completingTask} onComplete={(result) => { void completeTask(result); }} onClose={() => setCompletingTaskId(null)} />}
    </section>
  );
}
