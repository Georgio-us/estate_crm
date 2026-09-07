import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Deal } from "@/types/crm";
import styles from "./pipeline.module.css";

interface DealCardProps {
  deal: Deal;
  onOpen: () => void;
}

const sourceLabels: Record<Deal["source"], string> = {
  Meta: "Meta",
  Website: "Сайт",
  Manual: "Вручную",
};

export function DealCard({ deal, onOpen }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

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
      <DealCardContent deal={deal} />
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

function DealCardContent({ deal }: { deal: Deal }) {
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
          <button type="button" aria-label="Меню сделки" onClick={(event) => event.stopPropagation()}>•••</button>
        </div>
      </div>
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
            {deal.task}
          </span>
        ) : (
          <span className={styles.noTask}>Нет задачи</span>
        )}
      </div>
    </>
  );
}
