"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./pilot-diagnostics.module.css";

type Summary = {
  since: string;
  total: number;
  members: Array<{ id: string; name: string; visits: number; actions: number; problems: number; slow: number; lastSeenAt: string | null }>;
  pages: Array<{ path: string; visits: number }>;
  days: Array<{ date: string; visits: number; actions: number; problems: number; slow: number }>;
  recent: Array<{ id: string; kind: string; name: string; path: string | null; device: string | null; statusCode: number | null; durationMs: number | null; requestId: string | null; createdAt: string; userName: string }>;
  truncated: boolean;
};

const pageNames: Record<string, string> = {
  "/": "Воронка", "/home": "Главная", "/contacts": "Контакты", "/objects": "Объекты",
  "/tasks": "Задачи", "/calendar": "Календарь", "/integrations": "Интеграции",
  "/team": "Команда", "/documentation": "Документация", "/subscription": "Подписка", "/settings": "Настройки",
};

function dateTime(value: string): string {
  return new Date(value).toLocaleString("ru", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function eventLabel(event: Summary["recent"][number]): string {
  if (event.kind === "browser_error") return event.name === "unhandled_rejection" ? "Ошибка браузера: запрос" : "Ошибка браузера";
  if (event.kind === "api_slow") return `Медленный ответ: ${event.name}`;
  const prefix = event.kind === "api_error" ? "Ошибка" : "Действие";
  return `${prefix}: ${event.name}`;
}

export function PilotDiagnostics() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/crm/pilot/summary", { cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить диагностику пилота.");
      setSummary(await response.json() as Summary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить диагностику пилота.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/crm/pilot/summary", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить диагностику пилота.");
        setSummary(await response.json() as Summary);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Не удалось загрузить диагностику пилота.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const totals = summary?.days.reduce((sum, day) => ({ visits: sum.visits + day.visits, actions: sum.actions + day.actions, problems: sum.problems + day.problems, slow: sum.slow + day.slow }), { visits: 0, actions: 0, problems: 0, slow: 0 });

  return <main className={styles.page}>
    <header className={styles.intro}><span>Контролируемый пилот</span><h2>Диагностика команды</h2><p>Последние 14 дней: куда заходили сотрудники, какие действия завершились и где возникли ошибки. Данные обновляются при открытии и по кнопке.</p><button type="button" onClick={() => { void reload(); }} disabled={loading}>{loading ? "Обновляем…" : "Обновить"}</button></header>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {!summary && !error && <p className={styles.empty}>Загружаем события пилота…</p>}
    {summary && <>
      <div className={styles.stats}>
        <article><span>Сотрудников</span><strong>{summary.members.length}</strong><small>с активностью за период</small></article>
        <article><span>Открытий разделов</span><strong>{totals?.visits ?? 0}</strong><small>переходы внутри CRM</small></article>
        <article><span>Действий</span><strong>{totals?.actions ?? 0}</strong><small>успешные изменения данных</small></article>
        <article><span>Ошибок</span><strong>{totals?.problems ?? 0}</strong><small>API и браузер</small></article>
        <article><span>Медленных ответов</span><strong>{totals?.slow ?? 0}</strong><small>от 1,5 секунды</small></article>
      </div>
      {summary.truncated && <p className={styles.note}>Показаны последние 5000 событий. Для полного периода потребуется расширить выборку.</p>}
      <div className={styles.columns}>
        <section className={styles.panel}><h3>Активность сотрудников</h3>{summary.members.length ? <div className={styles.rows}>{summary.members.map((member) => <div className={styles.member} key={member.id}><div><strong>{member.name}</strong><small>Последний переход: {member.lastSeenAt ? dateTime(member.lastSeenAt) : "—"}</small></div><span>{member.visits} переходов</span><span>{member.actions} действий</span><span className={member.problems ? styles.problem : ""}>{member.problems} ошибок</span><span>{member.slow} медленно</span></div>)}</div> : <p className={styles.empty}>Сотрудники ещё не открывали CRM после включения диагностики.</p>}</section>
        <section className={styles.panel}><h3>Разделы</h3>{summary.pages.length ? <div className={styles.rows}>{summary.pages.map((page) => <div className={styles.pageRow} key={page.path}><span>{pageNames[page.path] ?? page.path}</span><strong>{page.visits}</strong></div>)}</div> : <p className={styles.empty}>Переходов пока нет.</p>}</section>
      </div>
      <section className={styles.panel}><h3>По дням</h3>{summary.days.length ? <div className={styles.dayGrid}>{summary.days.map((day) => <div key={day.date}><strong>{new Date(`${day.date}T12:00:00`).toLocaleDateString("ru", { day: "2-digit", month: "2-digit" })}</strong><span>{day.visits} переходов</span><span>{day.actions} действий</span><span className={day.problems ? styles.problem : ""}>{day.problems} ошибок</span><span>{day.slow} медленно</span></div>)}</div> : <p className={styles.empty}>Событий пока нет.</p>}</section>
      <section className={styles.panel}><h3>Действия и ошибки</h3>{summary.recent.length ? <div className={styles.rows}>{summary.recent.map((event) => <div className={styles.event} key={event.id}><div><strong className={event.kind.includes("error") ? styles.problem : ""}>{eventLabel(event)}</strong><small>{event.userName} · {event.device === "mobile" ? "телефон" : "компьютер"} · {dateTime(event.createdAt)}</small></div><span>{event.statusCode ?? "—"}{event.durationMs !== null ? ` · ${event.durationMs} мс` : ""}</span>{event.requestId && <code title="Идентификатор для поиска в журнале API">{event.requestId}</code>}</div>)}</div> : <p className={styles.empty}>Изменений и ошибок пока нет.</p>}</section>
      <p className={styles.note}>CRM хранит эти диагностические события 30 дней. Записи экранов, тексты примечаний и данные клиентских карточек сюда не попадают. Если API недоступен целиком, событие в этом списке не сохранится — проверяйте также журнал Railway.</p>
    </>}
  </main>;
}
