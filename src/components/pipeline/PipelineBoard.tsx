"use client";

import { useMemo, useState } from "react";
import {
  closestCorners,
  DragOverlay,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { mockActivities } from "@/data/mock-activities";
import { pipelineStages } from "@/data/mock-pipeline";
import type { ActivityEvent, Deal } from "@/types/crm";
import { DealDrawer } from "./DealDrawer";
import { DealCardPreview } from "./DealCard";
import { NewDealModal, type NewDealDraft } from "./NewDealModal";
import { PipelineColumn } from "./PipelineColumn";
import styles from "./pipeline.module.css";

export function PipelineBoard() {
  const [stages, setStages] = useState(pipelineStages);
  const [activities, setActivities] = useState(mockActivities);
  const [selected, setSelected] = useState<{ dealId: string; stageId: string } | null>(null);
  const [newDealStageId, setNewDealStageId] = useState<string | null>(null);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dealsCount = stages.reduce((total, stage) => total + stage.deals.length, 0);
  const selectedStage = selected ? stages.find((stage) => stage.id === selected.stageId) : undefined;
  const selectedDeal = selectedStage?.deals.find((deal) => deal.id === selected?.dealId);

  const stageOptions = useMemo(
    () => stages.map(({ id, title }) => ({ id, title })),
    [stages],
  );

  const selectedActivities = selected ? activities[selected.dealId] || [] : [];
  const activeDeal = activeDealId
    ? stages.flatMap((stage) => stage.deals).find((deal) => deal.id === activeDealId)
    : undefined;

  function currentTime() {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());
  }

  function appendActivity(event: Omit<ActivityEvent, "id" | "occurredAt">) {
    const activity: ActivityEvent = {
      ...event,
      id: `activity-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      occurredAt: currentTime(),
    };

    setActivities((current) => ({
      ...current,
      [event.dealId]: [activity, ...(current[event.dealId] || [])],
    }));
  }

  function updateDeal(patch: Partial<Deal>) {
    if (!selected || !selectedDeal) return;

    if (patch.assignee && patch.assignee !== selectedDeal.assignee) {
      appendActivity({
        dealId: selected.dealId,
        category: "change",
        title: "Изменён ответственный",
        description: `${selectedDeal.assignee} → ${patch.assignee}`,
        author: "Георгий",
      });
    }

    setStages((current) =>
      current.map((stage) =>
        stage.id === selected.stageId
          ? {
              ...stage,
              deals: stage.deals.map((deal) =>
                deal.id === selected.dealId ? { ...deal, ...patch } : deal,
              ),
            }
          : stage,
      ),
    );
  }

  function moveDeal(nextStageId: string) {
    if (!selected || nextStageId === selected.stageId || !selectedDeal) return;

    const previousStageTitle = stages.find((stage) => stage.id === selected.stageId)?.title;
    const nextStageTitle = stages.find((stage) => stage.id === nextStageId)?.title;

    setStages((current) =>
      current.map((stage) => {
        if (stage.id === selected.stageId) {
          return { ...stage, deals: stage.deals.filter((deal) => deal.id !== selected.dealId) };
        }

        if (stage.id === nextStageId) {
          return { ...stage, deals: [...stage.deals, selectedDeal] };
        }

        return stage;
      }),
    );
    setSelected({ ...selected, stageId: nextStageId });

    appendActivity({
      dealId: selected.dealId,
      category: "change",
      title: "Этап изменён",
      description: `${previousStageTitle} → ${nextStageTitle}`,
      author: "Георгий",
    });
  }

  function addNote(text: string) {
    if (!selected) return;

    appendActivity({
      dealId: selected.dealId,
      category: "note",
      title: "Добавлено примечание",
      description: text,
      author: "Георгий",
    });
  }

  function addTask(title: string, dueAt?: string) {
    if (!selected) return;

    updateDeal({ task: title, taskState: "normal" });
    appendActivity({
      dealId: selected.dealId,
      category: "task",
      title: "Поставлена задача",
      description: dueAt ? `${title} · ${dueAt}` : title,
      author: "Георгий",
    });
  }

  function completeTask(result: string) {
    if (!selected || !selectedDeal?.task) return;

    const completedTask = selectedDeal.task;
    updateDeal({ task: undefined, taskState: undefined });
    appendActivity({
      dealId: selected.dealId,
      category: "task",
      title: "Задача выполнена",
      description: result ? `${completedTask} · ${result}` : completedTask,
      author: "Георгий",
    });
  }

  function createDeal(draft: NewDealDraft) {
    const dealId = `deal-${Date.now()}`;
    const deal: Deal = {
      id: dealId,
      number: 1000 + dealsCount + 1,
      contactName: draft.contactName,
      phone: draft.phone,
      request: draft.request || "Запрос ещё не уточнён",
      budget: draft.budget,
      operation: draft.operation,
      propertyType: draft.propertyType,
      district: draft.district,
      rooms: draft.rooms,
      source: draft.source,
      assignee: draft.assignee,
      createdAt: "Только что",
    };

    setStages((current) => current.map((stage) => (
      stage.id === draft.stageId ? { ...stage, deals: [deal, ...stage.deals] } : stage
    )));
    setActivities((current) => ({
      ...current,
      [dealId]: [{
        id: `activity-${Date.now()}`,
        dealId,
        category: "source",
        title: "Сделка создана",
        description: draft.source === "Manual" ? "Добавлена вручную" : `Источник ${draft.source}`,
        author: "Георгий",
        occurredAt: currentTime(),
      }],
    }));
    setNewDealStageId(null);
    setSelected({ dealId, stageId: draft.stageId });
  }

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDealId(String(active.id));
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDealId(null);
    if (!over) return;

    const dealId = String(active.id);
    const overId = String(over.id);
    const sourceStage = stages.find((stage) => stage.deals.some((deal) => deal.id === dealId));
    const targetStage = overId.startsWith("stage:")
      ? stages.find((stage) => stage.id === overId.replace("stage:", ""))
      : stages.find((stage) => stage.deals.some((deal) => deal.id === overId));

    if (!sourceStage || !targetStage) return;

    if (sourceStage.id === targetStage.id) {
      const oldIndex = sourceStage.deals.findIndex((deal) => deal.id === dealId);
      const newIndex = targetStage.deals.findIndex((deal) => deal.id === overId);
      if (oldIndex === newIndex || newIndex < 0) return;

      setStages((current) => current.map((stage) => (
        stage.id === sourceStage.id ? { ...stage, deals: arrayMove(stage.deals, oldIndex, newIndex) } : stage
      )));
      return;
    }

    const movedDeal = sourceStage.deals.find((deal) => deal.id === dealId);
    if (!movedDeal) return;

    setStages((current) => current.map((stage) => {
      if (stage.id === sourceStage.id) {
        return { ...stage, deals: stage.deals.filter((deal) => deal.id !== dealId) };
      }

      if (stage.id === targetStage.id) {
        const overIndex = stage.deals.findIndex((deal) => deal.id === overId);
        const nextDeals = [...stage.deals];
        nextDeals.splice(overIndex < 0 ? nextDeals.length : overIndex, 0, movedDeal);
        return { ...stage, deals: nextDeals };
      }

      return stage;
    }));

    appendActivity({
      dealId,
      category: "change",
      title: "Этап изменён",
      description: `${sourceStage.title} → ${targetStage.title}`,
      author: "Георгий",
    });
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.mobileBrand}>E</div>
        <h1>Воронка</h1>

        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Поиск по сделкам" />
        </label>

        <button className={styles.iconButton} type="button" aria-label="Уведомления">
          ♢
          <span className={styles.notificationDot} />
        </button>
        <button className={styles.primaryButton} type="button" onClick={() => setNewDealStageId(stages[0]?.id || "unassigned")}>
          <span>＋</span> Новая сделка
        </button>
      </header>

      <div className={styles.toolbar}>
        <div>
          <div className={styles.titleRow}>
            <h2>Продажа недвижимости</h2>
            <button className={styles.titleMenu} type="button" aria-label="Настройки воронки">
              •••
            </button>
          </div>
          <p>{dealsCount} активных сделок</p>
        </div>

        <div className={styles.toolbarActions}>
          <div className={styles.viewSwitch}>
            <button className={styles.viewActive} type="button">Доска</button>
            <button type="button">Список</button>
          </div>
          <button className={styles.secondaryButton} type="button">Фильтры</button>
        </div>
      </div>

      <DndContext
        id="pipeline-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDealId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.board}>
          {stages.map((stage) => (
            <PipelineColumn
              stage={stage}
              key={stage.id}
              onOpenDeal={(dealId) => setSelected({ dealId, stageId: stage.id })}
              onAddDeal={() => setNewDealStageId(stage.id)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
          {activeDeal ? <DealCardPreview deal={activeDeal} /> : null}
        </DragOverlay>
      </DndContext>

      {selectedDeal && selectedStage && (
        <DealDrawer
          deal={selectedDeal}
          stageId={selectedStage.id}
          stages={stageOptions}
          activities={selectedActivities}
          onChange={updateDeal}
          onChangeStage={moveDeal}
          onAddNote={addNote}
          onAddTask={addTask}
          onCompleteTask={completeTask}
          onClose={() => setSelected(null)}
        />
      )}

      {newDealStageId && (
        <NewDealModal
          initialStageId={newDealStageId}
          stages={stageOptions}
          onCreate={createDeal}
          onClose={() => setNewDealStageId(null)}
        />
      )}
    </section>
  );
}
