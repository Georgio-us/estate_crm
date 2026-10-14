"use client";

import { useEffect, useRef, useState } from "react";
import { dateInTimezone, periodBounds, periodLabel, shiftDate, shortDate, type DealPeriod } from "@/lib/deal-period";
import { UiIcon } from "@/components/ui/UiIcon";
import styles from "./deal-period.module.css";

const presets = [7, 14, 28, 30, 90];
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function DealPeriodPicker({ value, onChange, timeZone }: { value: DealPeriod; onChange: (value: DealPeriod) => void; timeZone: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DealPeriod>(value);
  const [start, setStart] = useState<string | null>(null);
  const [month, setMonth] = useState("");
  const today = dateInTimezone(new Date(), timeZone);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  function begin() {
    setDraft(value);
    setStart(null);
    setMonth((periodBounds(value, today)?.from || today).slice(0, 7));
    setOpen(true);
  }
  function close() { setOpen(false); trigger.current?.focus(); }
  function selectDay(day: string) {
    if (!start) { setStart(day); return; }
    setDraft({ kind: "range", from: day < start ? day : start, to: day < start ? start : day });
    setStart(null);
  }
  function changeMonth(offset: number) {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(date.toISOString().slice(0, 7));
  }
  const bounds = periodBounds(draft, today);
  const firstDay = month ? `${month}-01` : `${today.slice(0, 7)}-01`;
  const offset = (new Date(`${firstDay}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => shiftDate(firstDay, index - offset));

  return <>
    <button ref={trigger} type="button" className={`${styles.trigger} ${value.kind !== "all" ? styles.active : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={begin}><UiIcon name="calendar" /><span>{periodLabel(value)}</span><span aria-hidden="true">⌄</span></button>
    <dialog ref={dialog} className={styles.dialog} onCancel={close} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) close(); }} aria-labelledby="deal-period-title">
      <header className={styles.header}><div><h2 id="deal-period-title">Дата поступления</h2><p>Выберите период создания лида в CRM</p></div><button type="button" aria-label="Закрыть выбор периода" onClick={close}>×</button></header>
      <div className={styles.body}>
        <div className={styles.presets}><span>Быстрый выбор</span>{presets.map((days) => <button type="button" key={days} aria-pressed={draft.kind === "days" && draft.days === days && !start} onClick={() => { setDraft({ kind: "days", days }); setStart(null); }}>{`Последние ${days} дней`}</button>)}<button type="button" aria-pressed={draft.kind === "all" && !start} onClick={() => { setDraft({ kind: "all" }); setStart(null); }}>За всё время</button></div>
        <div className={styles.calendar}>
          <div className={styles.range}><span>С {start ? shortDate(start) : bounds ? shortDate(bounds.from) : "начала"}</span><span>По {start ? "выберите дату" : bounds ? shortDate(bounds.to) : "сегодня"}</span></div>
          <div className={styles.month}><button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>‹</button><strong>{new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${firstDay}T12:00:00Z`))}</strong><button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)}>›</button></div>
          <div className={styles.grid}>{weekdays.map((day) => <span key={day}>{day}</span>)}{cells.map((day) => {
            const selected = start ? day === start : bounds && (day === bounds.from || day === bounds.to);
            const inside = !start && bounds && day > bounds.from && day < bounds.to;
            return <button type="button" key={day} aria-label={shortDate(day)} aria-pressed={Boolean(selected)} disabled={day > today} className={`${day.slice(0, 7) !== firstDay.slice(0, 7) ? styles.muted : ""} ${selected ? styles.selected : ""} ${inside ? styles.inside : ""} ${day === today ? styles.today : ""}`} onClick={() => selectDay(day)}>{Number(day.slice(-2))}</button>;
          })}</div>
          <p className={styles.hint} aria-live="polite">{start ? "Теперь выберите последний день периода" : "Нажмите на первый и последний день периода"}</p>
        </div>
      </div>
      <footer className={styles.footer}><span>Даты включительно · {timeZone}</span><button type="button" onClick={close}>Отмена</button><button type="button" className={styles.apply} disabled={Boolean(start)} onClick={() => { onChange(draft); close(); }}>Применить</button></footer>
    </dialog>
  </>;
}
