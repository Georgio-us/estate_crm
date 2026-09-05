import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { PipelineStage } from "@/types/crm";
import { DealCard } from "./DealCard";
import styles from "./pipeline.module.css";

interface PipelineColumnProps {
  stage: PipelineStage;
  onOpenDeal: (dealId: string) => void;
  onAddDeal: () => void;
}

export function PipelineColumn({ stage, onOpenDeal, onAddDeal }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage.id}` });

  return (
    <div className={`${styles.column} ${isOver ? styles.columnOver : ""}`} ref={setNodeRef}>
      <div className={styles.columnHeader}>
        <div className={styles.columnTitle}>
          <span className={styles.stageDot} style={{ backgroundColor: stage.color }} />
          <h3>{stage.title}</h3>
          <span className={styles.stageCount}>{stage.deals.length}</span>
        </div>
        <button type="button" onClick={onAddDeal} aria-label={`Добавить сделку в этап ${stage.title}`}>＋</button>
      </div>

      <div className={styles.columnAccent} style={{ backgroundColor: stage.color }} />

      <SortableContext items={stage.deals.map((deal) => deal.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.cardList}>
          {stage.deals.map((deal) => (
            <DealCard deal={deal} key={deal.id} onOpen={() => onOpenDeal(deal.id)} />
          ))}
          <button className={styles.quickAdd} type="button" onClick={onAddDeal}>＋ Добавить сделку</button>
        </div>
      </SortableContext>
    </div>
  );
}
