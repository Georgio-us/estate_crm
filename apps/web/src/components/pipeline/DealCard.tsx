import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Deal } from "@/types/crm";
import styles from "./pipeline.module.css";

interface DealCardProps {
  deal: Deal;
  stageId: string;
  onOpen: () => void;
  onAddTask: () => void;
  onLifecycle: (status: "WON" | "LOST" | "ARCHIVED") => Promise<void>;
}

const sourceLabels: Record<Deal["source"], string> = {
  Meta: "Meta",
  Website: "Сайт",
  Manual: "Не указан",
};

function taskCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} задач`;
  if (mod10 === 1) return `${count} задача`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} задачи`;
  return `${count} задач`;
}

export function DealCard({ deal, stageId, onOpen, onAddTask, onLifecycle }: DealCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: deal.id,
    data: { type: "deal", stageId },
  });

  return (
    <article
      className={`${styles.card} ${isDragging ? styles.cardDragging : ""}`}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
      title="Зажмите карточку и перетащите в другой этап"
      {...attributes}
      {...listeners}
    >
      <DealCardContent deal={deal} menuOpen={menuOpen} busy={busy} onMenuToggle={() => setMenuOpen((value) => !value)} onOpen={onOpen} onAddTask={onAddTask} onLifecycle={async (status) => { setBusy(true); try { await onLifecycle(status); } finally { setBusy(false); } }} onMenuClose={() => setMenuOpen(false)} />
    </article>
  );
}

export function DealCardPreview({ deal }: { deal: Deal }) {
  return (
    <article className={`${styles.card} ${styles.cardOverlay}`} aria-hidden="true">
      <DealCardContent deal={deal} />
    </article>
  );
}

function DealCardContent({ deal, menuOpen = false, busy = false, onMenuToggle, onMenuClose, onOpen, onAddTask, onLifecycle }: { deal: Deal; menuOpen?: boolean; busy?: boolean; onMenuToggle?: () => void; onMenuClose?: () => void; onOpen?: () => void; onAddTask?: () => void; onLifecycle?: (status: "WON" | "LOST" | "ARCHIVED") => Promise<void> }) {
  return (
    <>
      <div className={styles.cardTopline}>
        <h4>{deal.title || deal.request}</h4>
        <div className={styles.cardActions}>
          <button
            className={styles.dragHandle}
            type="button"
            aria-label="Переместить сделку"
            onClick={(event) => event.stopPropagation()}
          >
            ⠿
          </button>
          <button type="button" aria-label="Меню сделки" aria-expanded={menuOpen} onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onMenuToggle?.(); }}>•••</button>
        </div>
      </div>
      {menuOpen && <div className={styles.cardMenu} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => { onMenuClose?.(); onOpen?.(); }}>Открыть сделку</button>
        <button type="button" onClick={() => { onMenuClose?.(); onAddTask?.(); }}>Поставить задачу</button>
        <span />
        <button type="button" disabled={busy} onClick={() => { void onLifecycle?.("WON"); }}>Завершить успешно</button>
        <button type="button" disabled={busy} onClick={() => { void onLifecycle?.("LOST"); }}>Закрыть неуспешно</button>
        <button className={styles.menuMuted} type="button" disabled={busy} onClick={() => { void onLifecycle?.("ARCHIVED"); }}>В архив</button>
      </div>}
      <a
        className={styles.phone}
        href={`tel:${deal.phone.replaceAll(" ", "")}`}
        onClick={(event) => event.stopPropagation()}
      >
        {deal.phone}
      </a>
      <p className={styles.request}>{deal.contactName}{deal.request ? ` · ${deal.request}` : ""}</p>
      {deal.budget && <p className={styles.budget}>{deal.budget}</p>}

      <div className={styles.tags}>
        <span>{sourceLabels[deal.source]}</span>
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.assignee} title={deal.assignee}>
          {deal.assignee === "Не назначен" ? "—" : deal.assignee.slice(0, 1)}
        </span>
        {deal.task ? (
          <span className={`${styles.task} ${deal.taskState ? styles[deal.taskState] : ""}`}>
            <b>{deal.taskCount && deal.taskCount > 1 ? taskCountLabel(deal.taskCount) : deal.taskDueLabel}</b>
            <span>{deal.task}</span>
          </span>
        ) : (
          <span className={styles.noTask}>Нет задачи</span>
        )}
      </div>
    </>
  );
}
