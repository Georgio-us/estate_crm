"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
import { TaskDetailsModal } from "@/components/tasks/TaskDetailsModal";
import { useTasks } from "@/components/tasks/TasksContext";
import { useCurrentUser } from "@/components/auth/AuthContext";
import type { ActivityCategory, CrmTask } from "@/types/crm";
import styles from "./dashboard.module.css";

const activityIcons: Record<ActivityCategory, string> = {
  note: "≡",
  task: "✓",
  change: "↔",
  source: "↗",
  object: "◇",
};

const taskKindIcons: Record<CrmTask["kind"], string> = {
  Звонок: "☎",
  Встреча: "□",
  Сообщение: "↗",
  Другое: "✓",
};

interface DashboardData {
  deals: { total: number; unassigned: number; withoutTask: number };
  contacts: { total: number };
  properties: { available: number };
  stages: Array<{ id: string; title: string; color: string; position: number; dealCount: number }>;
  activities: Array<{ id: string; contactId: string | null; dealId: string | null; category: "NOTE" | "TASK" | "CHANGE" | "SOURCE" | "OBJECT"; title: string; description: string | null; occurredAt: string; contactName: string | null; dealNumber: number | null; dealTitle: string | null }>;
}

const emptyDashboard: DashboardData = { deals: { total: 0, unassigned: 0, withoutTask: 0 }, contacts: { total: 0 }, properties: { available: 0 }, stages: [], activities: [] };
const activityCategoryFromApi = { NOTE: "note", TASK: "task", CHANGE: "change", SOURCE: "source", OBJECT: "object" } as const;

function activityTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date) : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function Dashboard() {
  const router = useRouter();
  const user = useCurrentUser();
  const { tasks, contacts, deals: taskDeals, assignees, updateTask, completeTask: persistCompleteTask } = useTasks();
  const [dashboard, setDashboard] = useState<DashboardData>(emptyDashboard);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  async function reloadDashboard() {
    setLoadState("loading");
    try {
      const response = await fetch("/api/crm/dashboard", { cache: "no-store" });
      const payload = await response.json() as DashboardData;
      if (!response.ok) throw new Error();
      setDashboard(payload);
      setLoadState("ready");
    } catch { setLoadState("error"); }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/crm/dashboard", { cache: "no-store" }).then(async (response) => {
      const payload = await response.json() as DashboardData;
      if (!response.ok) throw new Error();
      if (active) { setDashboard(payload); setLoadState("ready"); }
    }).catch(() => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, []);

  const focusTasks = tasks
    .filter((task) => task.period === "overdue" || task.period === "today")
    .sort((first, second) => {
      if (first.period !== second.period) return first.period === "overdue" ? -1 : 1;
      return (first.dueTime || "99:99").localeCompare(second.dueTime || "99:99");
    });
  const overdueCount = tasks.filter((task) => task.period === "overdue").length;
  const todayCount = tasks.filter((task) => task.period === "today").length;
  const notificationCount = overdueCount + dashboard.deals.unassigned + dashboard.deals.withoutTask;
  const completedToday = tasks.filter((task) => task.period === "completed").length;
  const priorityTask = focusTasks[0];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const completingTask = tasks.find((task) => task.id === completingTaskId);
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date());

  const recentActivities = dashboard.activities.slice(0, 6);

  async function completeTask(result: string) {
    if (!completingTask) return;
    await persistCompleteTask(completingTask.id, result);
    await reloadDashboard();
    setCompletingTaskId(null);
  }

  async function saveTask(task: CrmTask) {
    const saved = await updateTask(task);
    await reloadDashboard();
    return saved;
  }

  function openTask(task: CrmTask) {
    if (task.dealId) router.push(`/?deal=${task.dealId}&task=${task.id}`);
    else setSelectedTaskId(task.id);
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Главная</h1>
        <div className={styles.notifications}>
          <button className={styles.notificationButton} type="button" aria-label={`Уведомления: ${notificationCount} новых`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((current) => !current)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            {notificationCount > 0 && <span>{notificationCount}</span>}
          </button>
          {notificationsOpen && <>
            <button className={styles.notificationBackdrop} type="button" aria-label="Закрыть уведомления" onClick={() => setNotificationsOpen(false)} />
            <aside className={styles.notificationPanel} aria-label="Последние уведомления">
              <header><div><strong>Уведомления</strong><span>{notificationCount} новых</span></div><button type="button" onClick={() => setNotificationsOpen(false)}>Закрыть</button></header>
              {overdueCount > 0 && <button className={styles.notificationItem} type="button" onClick={() => { if (priorityTask) openTask(priorityTask); setNotificationsOpen(false); }}>
                <i className={styles.notificationDanger}>!</i><span><strong>Просрочена задача</strong><small>{priorityTask?.title}{priorityTask?.contactName ? ` · ${priorityTask.contactName}` : ""}</small><time>Сейчас</time></span>
              </button>}
              {dashboard.deals.unassigned > 0 && <Link className={styles.notificationItem} href="/" onClick={() => setNotificationsOpen(false)}>
                <i className={styles.notificationWarning}>♙</i><span><strong>Без ответственного</strong><small>{dashboard.deals.unassigned} сделок ожидают назначения менеджера</small><time>Сейчас</time></span>
              </Link>}
              {dashboard.deals.withoutTask > 0 && <Link className={styles.notificationItem} href="/" onClick={() => setNotificationsOpen(false)}>
                <i className={styles.notificationLead}>↗</i><span><strong>Нет следующего шага</strong><small>В {dashboard.deals.withoutTask} сделках не поставлена активная задача</small><time>Сейчас</time></span>
              </Link>}
              {notificationCount === 0 && <div className={styles.notificationEmpty}>Новых ситуаций, требующих внимания, нет.</div>}
              <footer><Link href="/tasks" onClick={() => setNotificationsOpen(false)}>Перейти к задачам</Link></footer>
            </aside>
          </>}
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.heroBand}>
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>Рабочий день</span><h2>Добрый день, {user.name.split(/\s+/)[0]}</h2><p>{loadState === "loading" ? "Загружаем фактическое состояние CRM…" : loadState === "error" ? "Не удалось получить сводку CRM." : "Коротко о том, что происходит прямо сейчас."}</p>{loadState === "error" && <button className={styles.retryButton} type="button" onClick={() => { void reloadDashboard(); }}>Повторить загрузку</button>}</div>
          </div>

          <section className={styles.command} aria-label="Главное на сегодня">
            <div className={styles.commandMain}>
              <div className={styles.commandMeta}><span>Сегодня · {todayLabel}</span><i>{overdueCount ? "Требует действия" : "Всё по плану"}</i></div>
              <strong className={styles.commandNumber}>{overdueCount}</strong>
              <h3>{overdueCount ? "просроченная задача" : "просроченных задач"}</h3>
              {priorityTask ? <><p><b>{priorityTask.title}</b> · {priorityTask.contactName || "Без контакта"}</p><button type="button" onClick={() => openTask(priorityTask)}>Открыть в сделке <span>→</span></button></> : <p>Критичных действий сейчас нет.</p>}
            </div>
            <div className={styles.commandStats}>
              <Link href="/tasks"><strong>{todayCount}</strong><span>задачи<br />на сегодня</span></Link>
              <Link href="/"><strong>{dashboard.deals.unassigned}</strong><span>сделки без<br />ответственного</span></Link>
              <Link href="/"><strong>{dashboard.deals.withoutTask}</strong><span>сделки без<br />следующего шага</span></Link>
            </div>
          </section>

          <section className={styles.infoStrip} aria-label="Общее состояние CRM">
            <InfoMetric href="/" value={dashboard.deals.total} label="Активных сделок" />
            <InfoMetric href="/contacts" value={dashboard.contacts.total} label="Контактов в базе" />
            <InfoMetric href="/objects" value={dashboard.properties.available} label="Доступных объектов" />
            <InfoMetric href="/tasks" value={completedToday} label="Задач выполнено" />
          </section>
        </section>

        <section className={styles.focusBand}>
          <div className={styles.primaryGrid}>
            <section className={styles.panel}>
              <PanelHeader title="Фокус на сегодня" subtitle={`${focusTasks.length} действий требуют внимания`} href="/tasks" linkLabel="Все задачи" />
              <div className={styles.taskList}>
                {focusTasks.length ? focusTasks.slice(0, 4).map((task) => (
                  <article className={styles.taskRow} key={task.id}>
                    <button className={`${styles.taskCheck} ${task.period === "overdue" ? styles.taskCheckOverdue : ""}`} type="button" aria-label={`Выполнить: ${task.title}`} onClick={() => setCompletingTaskId(task.id)} />
                    <span className={styles.taskIcon}>{taskKindIcons[task.kind]}</span>
                    <button className={styles.taskText} type="button" onClick={() => openTask(task)}><strong>{task.title}</strong><span>{task.contactName || "Без контакта"}{task.dealNumber ? ` · Сделка #${task.dealNumber}` : ""}</span></button>
                    <time className={task.period === "overdue" ? styles.overdue : ""}>{task.period === "overdue" ? "Просрочено" : task.dueTime || "Сегодня"}</time>
                  </article>
                )) : <div className={styles.empty}><span>✓</span><strong>На сегодня всё выполнено</strong><p>Новых задач, требующих внимания, нет.</p></div>}
              </div>
            </section>

            <section className={styles.panel}>
              <PanelHeader title="Требует внимания" subtitle="Ситуации, где работа может остановиться" />
              <div className={styles.attentionList}>
                <Attention href="/tasks" value={overdueCount} title="Просроченная задача" detail="Нужно зафиксировать результат" tone="red" />
                <Attention href="/" value={dashboard.deals.unassigned} title="Без ответственного" detail="Новые сделки ждут менеджера" tone="orange" />
                <Attention href="/" value={dashboard.deals.withoutTask} title="Без следующего шага" detail="В сделках не назначена задача" tone="blue" />
              </div>
            </section>
          </div>
        </section>

        <section className={styles.insightsBand}>
          <div className={styles.secondaryGrid}>
            <section className={styles.panel}>
              <PanelHeader title="Воронка продаж" subtitle="Где сейчас находятся активные сделки" href="/" linkLabel="Открыть доску" />
              <div className={styles.pipeline}>
                <div className={styles.pipelineBar} aria-label="Распределение сделок по этапам">
                  {dashboard.stages.map((stage) => <span title={`${stage.title}: ${stage.dealCount}`} style={{ background: stage.color, flexGrow: Math.max(stage.dealCount, .15) }} key={stage.id} />)}
                </div>
                <div className={styles.pipelineLegend}>
                  {dashboard.stages.map((stage) => <Link href="/" key={stage.id}><i style={{ background: stage.color }} /><strong>{stage.dealCount}</strong><span>{stage.title}</span></Link>)}
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <PanelHeader title="Последние события" subtitle="Свежие изменения по сделкам" href="/" linkLabel="В воронку" />
              <div className={styles.activityList}>
                {recentActivities.length ? recentActivities.map((activity) => <Link className={styles.activity} href={activity.dealId ? `/?deal=${activity.dealId}` : activity.contactId ? `/contacts?contact=${activity.contactId}` : "/home"} key={activity.id}><span className={styles.activityIcon}>{activityIcons[activityCategoryFromApi[activity.category]]}</span><span><strong>{activity.title}</strong><small>{activity.contactName || (activity.dealNumber ? `Сделка #${activity.dealNumber}` : "Системное событие")}{activity.description ? ` · ${activity.description}` : ""}</small></span><time>{activityTime(activity.occurredAt)}</time></Link>) : <div className={styles.activityEmpty}>Событий пока нет.</div>}
              </div>
            </section>
          </div>
        </section>
      </main>

      {completingTask && <CompleteTaskModal task={completingTask} onComplete={(result) => { void completeTask(result); }} onClose={() => setCompletingTaskId(null)} />}
      {selectedTask && <TaskDetailsModal task={selectedTask} contacts={contacts} deals={taskDeals} assignees={assignees} currentUserId={user.id} onSave={saveTask} onClose={() => setSelectedTaskId(null)} />}
    </section>
  );
}

function InfoMetric({ href, label, value }: { href: string; label: string; value: number }) {
  return <Link href={href}><strong>{value}</strong><span>{label}</span></Link>;
}

function PanelHeader({ title, subtitle, href, linkLabel }: { title: string; subtitle: string; href?: string; linkLabel?: string }) {
  return <header className={styles.panelHeader}><div><h3>{title}</h3><p>{subtitle}</p></div>{href && <Link href={href}>{linkLabel}</Link>}</header>;
}

function Attention({ href, value, title, detail, tone }: { href: string; value: number; title: string; detail: string; tone: "orange" | "blue" | "red" }) {
  return <Link className={`${styles.attention} ${styles[`attention_${tone}`]}`} href={href}><strong>{value}</strong><span><b>{title}</b><small>{detail}</small></span><i aria-hidden="true">›</i></Link>;
}
