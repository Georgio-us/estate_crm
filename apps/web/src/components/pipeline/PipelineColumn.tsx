import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { PipelineStage } from "@/types/crm";
import { DealCard } from "./DealCard";
import styles from "./pipeline.module.css";

interface PipelineColumnProps {
  stage: PipelineStage;
  onOpenDeal: (dealId: string) => void;
  onAddTask: (dealId: string) => void;
  onLifecycle: (dealId: string, status: "WON" | "LOST" | "ARCHIVED") => Promise<void>;
  onAddDeal: () => void;
  readDealIds: Set<string>;
}

export function PipelineColumn({ stage, onOpenDeal, onAddTask, onLifecycle, onAddDeal, readDealIds }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage:${stage.id}`,
    data: { type: "stage", stageId: stage.id },
  });

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
            <DealCard deal={deal} stageId={stage.id} key={deal.id} unread={stage.title.toLocaleLowerCase("ru").includes("неразобран") && !readDealIds.has(deal.id)} onOpen={() => onOpenDeal(deal.id)} onAddTask={() => onAddTask(deal.id)} onLifecycle={(status) => onLifecycle(deal.id, status)} />
          ))}
          <button className={styles.quickAdd} type="button" onClick={onAddDeal}>＋ Добавить сделку</button>
        </div>
      </SortableContext>
    </div>
  );
}
