"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { mockActivities } from "@/data/mock-activities";
import { mockContacts } from "@/data/mock-contacts";
import { pipelineStages } from "@/data/mock-pipeline";
import { mockProperties } from "@/data/mock-properties";
import { CompleteTaskModal } from "@/components/tasks/CompleteTaskModal";
import { TaskDetailsModal } from "@/components/tasks/TaskDetailsModal";
import { useTasks } from "@/components/tasks/TasksContext";
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

function activityWeight(occurredAt: string) {
  if (occurredAt.startsWith("Вчера")) return -1;
  const match = occurredAt.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -2;
}

export function Dashboard() {
  const { tasks, setTasks } = useTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const deals = useMemo(() => pipelineStages.flatMap((stage) => stage.deals), []);
  const focusTasks = tasks
    .filter((task) => task.period === "overdue" || task.period === "today")
    .sort((first, second) => {
      if (first.period !== second.period) return first.period === "overdue" ? -1 : 1;
      return (first.dueTime || "99:99").localeCompare(second.dueTime || "99:99");
    });
  const overdueCount = tasks.filter((task) => task.period === "overdue").length;
  const todayCount = tasks.filter((task) => task.period === "today").length;
  const notificationCount = 2 + (overdueCount ? 1 : 0);
  const unassignedDeals = deals.filter((deal) => deal.assignee === "Не назначен");
  const dealsWithoutTask = deals.filter((deal) => !deal.task);
  const availableProperties = mockProperties.filter((property) => property.status === "Доступен").length;
  const completedToday = tasks.filter((task) => task.period === "completed").length;
  const priorityTask = focusTasks[0];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const completingTask = tasks.find((task) => task.id === completingTaskId);

  const recentActivities = useMemo(() => Object.values(mockActivities)
    .flat()
    .map((activity) => ({
      ...activity,
      deal: deals.find((deal) => deal.id === activity.dealId),
    }))
    .sort((first, second) => activityWeight(second.occurredAt) - activityWeight(first.occurredAt))
    .slice(0, 6), [deals]);

  function completeTask(result: string) {
    if (!completingTask) return;
    setTasks((current) => current.map((task) => task.id === completingTask.id
      ? { ...task, period: "completed", result: result || "Выполнено", completedAt: "Только что" }
      : task));
    setCompletingTaskId(null);
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <h1>Главная</h1>
        <div className={styles.notifications}>
          <button className={styles.notificationButton} type="button" aria-label={`Уведомления: ${notificationCount} новых`} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((current) => !current)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            <span>{notificationCount}</span>
          </button>
          {notificationsOpen && <>
            <button className={styles.notificationBackdrop} type="button" aria-label="Закрыть уведомления" onClick={() => setNotificationsOpen(false)} />
            <aside className={styles.notificationPanel} aria-label="Последние уведомления">
              <header><div><strong>Уведомления</strong><span>{notificationCount} новых</span></div><button type="button" onClick={() => setNotificationsOpen(false)}>Закрыть</button></header>
              {overdueCount > 0 && <button className={styles.notificationItem} type="button" onClick={() => { if (priorityTask) setSelectedTaskId(priorityTask.id); setNotificationsOpen(false); }}>
                <i className={styles.notificationDanger}>!</i><span><strong>Просрочена задача</strong><small>Позвонить Ольге Мельник до 14:00</small><time>Сейчас</time></span>
              </button>}
              <Link className={styles.notificationItem} href="/" onClick={() => setNotificationsOpen(false)}>
                <i className={styles.notificationLead}>↗</i><span><strong>Новый лид из Meta</strong><small>Анна Коваленко · ищет квартиру</small><time>10:42</time></span>
              </Link>
              <Link className={styles.notificationItem} href="/" onClick={() => setNotificationsOpen(false)}>
                <i className={styles.notificationWarning}>♙</i><span><strong>Не назначен ответственный</strong><small>Две сделки ожидают распределения</small><time>Сегодня</time></span>
              </Link>
              <footer><Link href="/tasks" onClick={() => setNotificationsOpen(false)}>Перейти к задачам</Link></footer>
            </aside>
          </>}
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.heroBand}>
          <div className={styles.heading}>
            <div><span className={styles.eyebrow}>Рабочий день</span><h2>Добрый день, Георгий</h2><p>Коротко о том, что происходит прямо сейчас.</p></div>
          </div>

          <section className={styles.command} aria-label="Главное на сегодня">
            <div className={styles.commandMain}>
              <div className={styles.commandMeta}><span>Сегодня · 5 сентября</span><i>{overdueCount ? "Требует действия" : "Всё по плану"}</i></div>
              <strong className={styles.commandNumber}>{overdueCount}</strong>
              <h3>{overdueCount ? "просроченная задача" : "просроченных задач"}</h3>
              {priorityTask ? <><p><b>{priorityTask.title}</b> · {priorityTask.contactName || "Без контакта"}</p><button type="button" onClick={() => setSelectedTaskId(priorityTask.id)}>Открыть задачу <span>→</span></button></> : <p>Критичных действий сейчас нет.</p>}
            </div>
            <div className={styles.commandStats}>
              <Link href="/tasks"><strong>{todayCount}</strong><span>задачи<br />на сегодня</span></Link>
              <Link href="/"><strong>{unassignedDeals.length}</strong><span>сделки без<br />ответственного</span></Link>
              <Link href="/"><strong>{dealsWithoutTask.length}</strong><span>сделки без<br />следующего шага</span></Link>
            </div>
          </section>

          <section className={styles.infoStrip} aria-label="Общее состояние CRM">
            <InfoMetric href="/" value={deals.length} label="Активных сделок" />
            <InfoMetric href="/contacts" value={mockContacts.length} label="Контактов в базе" />
            <InfoMetric href="/objects" value={availableProperties} label="Доступных объектов" />
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
                    <button className={styles.taskText} type="button" onClick={() => setSelectedTaskId(task.id)}><strong>{task.title}</strong><span>{task.contactName || "Без контакта"}{task.dealNumber ? ` · Сделка #${task.dealNumber}` : ""}</span></button>
                    <time className={task.period === "overdue" ? styles.overdue : ""}>{task.period === "overdue" ? "Просрочено" : task.dueTime || "Сегодня"}</time>
                  </article>
                )) : <div className={styles.empty}><span>✓</span><strong>На сегодня всё выполнено</strong><p>Новых задач, требующих внимания, нет.</p></div>}
              </div>
            </section>

            <section className={styles.panel}>
              <PanelHeader title="Требует внимания" subtitle="Ситуации, где работа может остановиться" />
              <div className={styles.attentionList}>
                <Attention href="/tasks" value={overdueCount} title="Просроченная задача" detail="Нужно зафиксировать результат" tone="red" />
                <Attention href="/" value={unassignedDeals.length} title="Без ответственного" detail="Новые сделки ждут менеджера" tone="orange" />
                <Attention href="/" value={dealsWithoutTask.length} title="Без следующего шага" detail="В сделках не назначена задача" tone="blue" />
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
                  {pipelineStages.map((stage) => <span title={`${stage.title}: ${stage.deals.length}`} style={{ background: stage.color, flexGrow: Math.max(stage.deals.length, .15) }} key={stage.id} />)}
                </div>
                <div className={styles.pipelineLegend}>
                  {pipelineStages.map((stage) => <Link href="/" key={stage.id}><i style={{ background: stage.color }} /><strong>{stage.deals.length}</strong><span>{stage.title}</span></Link>)}
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <PanelHeader title="Последние события" subtitle="Свежие изменения по сделкам" href="/" linkLabel="В воронку" />
              <div className={styles.activityList}>
                {recentActivities.map((activity) => <Link className={styles.activity} href="/" key={activity.id}><span className={styles.activityIcon}>{activityIcons[activity.category]}</span><span><strong>{activity.title}</strong><small>{activity.deal?.contactName || `Сделка #${activity.dealId}`}{activity.description ? ` · ${activity.description}` : ""}</small></span><time>{activity.occurredAt}</time></Link>)}
              </div>
            </section>
          </div>
        </section>
      </main>

      {completingTask && <CompleteTaskModal task={completingTask} onComplete={completeTask} onClose={() => setCompletingTaskId(null)} />}
      {selectedTask && <TaskDetailsModal task={selectedTask} onSave={(updatedTask) => { setTasks((current) => current.map((task) => task.id === updatedTask.id ? updatedTask : task)); setSelectedTaskId(null); }} onClose={() => setSelectedTaskId(null)} />}
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
