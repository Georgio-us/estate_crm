"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/auth/AuthContext";
import type { ActivityEvent, Deal, PipelineStage } from "@/types/crm";
import { DealDrawer } from "./DealDrawer";
import { DealCardPreview } from "./DealCard";
import { NewDealModal, type NewDealDraft } from "./NewDealModal";
import { PipelineColumn } from "./PipelineColumn";
import styles from "./pipeline.module.css";

const sourceFromApi = { META: "Meta", WEBSITE: "Website", MANUAL: "Manual" } as const;
const sourceToApi = { Meta: "META", Website: "WEBSITE", Manual: "MANUAL" } as const;
const operationFromApi = { PURCHASE: "Покупка", RENT: "Аренда", SALE: "Продажа" } as const;
const operationToApi = { Покупка: "PURCHASE", Аренда: "RENT", Продажа: "SALE" } as const;

interface ApiDeal {
  id: string;
  number: number;
  contact: { id: string; name: string; phone: string | null };
  title: string;
  request: string;
  budget: string | null;
  operation: keyof typeof operationFromApi;
  propertyType: string | null;
  district: string | null;
  rooms: string | null;
  source: keyof typeof sourceFromApi;
  assignee: { id: string; name: string } | null;
  comment: string | null;
  createdAt: string;
}

interface ApiStage { id: string; title: string; color: string; position: number; deals: ApiDeal[] }
interface ContactOption { id: string; name: string; phone: string | null }

function mapApiDeal(deal: ApiDeal): Deal {
  return {
    id: deal.id,
    number: deal.number,
    contactId: deal.contact.id,
    title: deal.title,
    contactName: deal.contact.name,
    phone: deal.contact.phone || "",
    request: deal.request,
    budget: deal.budget || undefined,
    operation: operationFromApi[deal.operation],
    propertyType: deal.propertyType || undefined,
    district: deal.district || undefined,
    rooms: deal.rooms || undefined,
    source: sourceFromApi[deal.source],
    assigneeId: deal.assignee?.id,
    assignee: deal.assignee?.name || "Не назначен",
    comment: deal.comment || undefined,
    createdAt: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(deal.createdAt)),
  };
}

async function requestPipeline(): Promise<{ name: string; stages: PipelineStage[] }> {
  const response = await fetch("/api/crm/pipeline", { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить воронку.");
  const payload = await response.json() as { pipeline: { name: string; stages: ApiStage[] } };
  return {
    name: payload.pipeline.name,
    stages: payload.pipeline.stages.map((stage) => ({ ...stage, deals: stage.deals.map(mapApiDeal) })),
  };
}

async function requestContactOptions(): Promise<ContactOption[]> {
  const response = await fetch("/api/crm/contacts", { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить контакты.");
  const payload = await response.json() as { contacts: ContactOption[] };
  return payload.contacts;
}

export function PipelineBoard() {
  const router = useRouter();
  const user = useCurrentUser();
  const [pipelineName, setPipelineName] = useState("Продажа недвижимости");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [activities, setActivities] = useState<Record<string, ActivityEvent[]>>({});
  const [selected, setSelected] = useState<{ dealId: string; stageId: string } | null>(null);
  const [newDealStageId, setNewDealStageId] = useState<string | null>(null);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState("Все");
  const [sourceFilter, setSourceFilter] = useState("Все");
  const [taskFilter, setTaskFilter] = useState("Все");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pipelineMenuOpen, setPipelineMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([requestPipeline(), requestContactOptions()]).then(
      ([pipeline, contactOptions]) => {
        if (!active) return;
        setPipelineName(pipeline.name);
        setStages(pipeline.stages);
        setContacts(contactOptions);
        setLoadState("ready");
      },
      () => { if (active) setLoadState("error"); },
    );
    return () => { active = false; };
  }, []);

  async function reloadPipeline() {
    try {
      const pipeline = await requestPipeline();
      setPipelineName(pipeline.name);
      setStages(pipeline.stages);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  async function persistStageMove(dealId: string, stageId: string, position = 0) {
    const response = await fetch(`/api/crm/deals/${dealId}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stageId, position }),
    });
    if (!response.ok) await reloadPipeline();
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dealsCount = stages.reduce((total, stage) => total + stage.deals.length, 0);
  const assignees = useMemo(() => ["Все", ...new Set(stages.flatMap((stage) => stage.deals.map((deal) => deal.assignee)))], [stages]);
  const activeFilters = [assigneeFilter, sourceFilter, taskFilter].filter((value) => value !== "Все").length;
  const filteredStages = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return stages.map((stage) => ({
      ...stage,
      deals: stage.deals.filter((deal) => {
        const matchesQuery = !normalized || `${deal.title || ""} ${deal.contactName} ${deal.phone} ${deal.request} ${deal.number}`.toLocaleLowerCase("ru").includes(normalized);
        const matchesAssignee = assigneeFilter === "Все" || deal.assignee === assigneeFilter;
        const matchesSource = sourceFilter === "Все" || deal.source === sourceFilter;
        const matchesTask = taskFilter === "Все" || (taskFilter === "Без задачи" ? !deal.task : deal.taskState === taskFilter);
        return matchesQuery && matchesAssignee && matchesSource && matchesTask;
      }),
    }));
  }, [assigneeFilter, query, sourceFilter, stages, taskFilter]);
  const visibleDealsCount = filteredStages.reduce((total, stage) => total + stage.deals.length, 0);
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
        author: user.name,
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

  async function saveDeal(nextDeal: Deal, nextStageId: string) {
    if (!selected || !selectedDeal) throw new Error("Сделка больше не открыта.");
    const response = await fetch(`/api/crm/deals/${selected.dealId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stageId: nextStageId,
        assigneeId: nextDeal.assigneeId || null,
        title: nextDeal.title || nextDeal.request,
        request: nextDeal.request,
        budget: nextDeal.budget || null,
        operation: nextDeal.operation ? operationToApi[nextDeal.operation] : "PURCHASE",
        propertyType: nextDeal.propertyType || null,
        district: nextDeal.district || null,
        rooms: nextDeal.rooms || null,
        source: sourceToApi[nextDeal.source],
        comment: nextDeal.comment || null,
      }),
    });
    const payload = await response.json() as { deal?: ApiDeal; stageId?: string; message?: string };
    if (!response.ok || !payload.deal || !payload.stageId) throw new Error(payload.message || "Не удалось сохранить сделку.");
    const savedDeal = mapApiDeal(payload.deal);

    setStages((current) => current.map((stage) => {
      const withoutDeal = stage.deals.filter((deal) => deal.id !== savedDeal.id);
      return stage.id === payload.stageId ? { ...stage, deals: [savedDeal, ...withoutDeal] } : { ...stage, deals: withoutDeal };
    }));
    setSelected({ dealId: savedDeal.id, stageId: payload.stageId });
    appendActivity({
      dealId: savedDeal.id,
      category: "change",
      title: "Изменения сохранены",
      description: "Обновлены параметры сделки",
      author: user.name,
    });
    return { deal: savedDeal, stageId: payload.stageId };
  }

  function addNote(text: string) {
    if (!selected) return;

    appendActivity({
      dealId: selected.dealId,
      category: "note",
      title: "Добавлено примечание",
      description: text,
      author: user.name,
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
      author: user.name,
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
      author: user.name,
    });
  }

  async function createDeal(draft: NewDealDraft) {
    const response = await fetch("/api/crm/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        stageId: draft.stageId,
        contactId: draft.contactId,
        contactName: draft.contactId ? undefined : draft.contactName,
        phone: draft.contactId ? undefined : draft.phone,
        assigneeId: draft.assigneeId || null,
        title: draft.title,
        request: draft.request,
        budget: draft.budget,
        operation: draft.operation ? operationToApi[draft.operation] : undefined,
        propertyType: draft.propertyType,
        district: draft.district,
        rooms: draft.rooms,
        source: sourceToApi[draft.source],
      }),
    });
    const payload = await response.json() as { deal?: ApiDeal; stageId?: string; message?: string };
    if (!response.ok || !payload.deal || !payload.stageId) throw new Error(payload.message || "Не удалось создать сделку.");
    const deal = mapApiDeal(payload.deal);
    const dealId = deal.id;

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
        author: user.name,
        occurredAt: currentTime(),
      }],
    }));
    setNewDealStageId(null);
    setSelected({ dealId, stageId: draft.stageId });
    if (!draft.contactId && deal.contactId) {
      setContacts((current) => current.some((item) => item.id === deal.contactId) ? current : [{ id: deal.contactId!, name: deal.contactName, phone: deal.phone || null }, ...current]);
    }
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
      void persistStageMove(dealId, sourceStage.id, newIndex);
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
      author: user.name,
    });
    const nextPosition = Math.max(0, targetStage.deals.findIndex((deal) => deal.id === overId));
    void persistStageMove(dealId, targetStage.id, nextPosition);
  }

  function resetFilters() {
    setAssigneeFilter("Все");
    setSourceFilter("Все");
    setTaskFilter("Все");
  }

  function exportDeals() {
    const rows = [["Номер", "Название сделки", "Контакт", "Телефон", "Запрос", "Этап", "Ответственный", "Источник"], ...stages.flatMap((stage) => stage.deals.map((deal) => [String(deal.number), deal.title || deal.request, deal.contactName, deal.phone, deal.request, stage.title, deal.assignee, deal.source]))];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    link.download = "deals.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    setPipelineMenuOpen(false);
  }

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.mobileBrand}>E</div>
        <h1>Воронка</h1>

        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Поиск по сделкам" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>

        <div className={styles.notificationWrap}>
        <button className={styles.iconButton} type="button" aria-label="Уведомления" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); setPipelineMenuOpen(false); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          <span className={styles.notificationDot} />
        </button>
        {notificationsOpen && <div className={styles.notificationPanel}><header><strong>Уведомления</strong><span>3 новых</span></header><button type="button" onClick={() => setNotificationsOpen(false)}><i className={styles.alertRed}>!</i><span><strong>Просрочена задача</strong><small>Ольга Мельник · Позвонить до 14:00</small></span><time>12 мин</time></button><button type="button" onClick={() => setNotificationsOpen(false)}><i className={styles.alertBlue}>↗</i><span><strong>Новая сделка из Meta</strong><small>Анна Коваленко · квартира в центре</small></span><time>34 мин</time></button><button type="button" onClick={() => setNotificationsOpen(false)}><i className={styles.alertAmber}>○</i><span><strong>Сделка без ответственного</strong><small>Максим Бондарь ожидает назначения</small></span><time>1 ч</time></button><footer>Показать все уведомления</footer></div>}
        </div>
        <button className={styles.primaryButton} type="button" disabled={!stages.length} onClick={() => { if (stages[0]) setNewDealStageId(stages[0].id); }}>
          <span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новая сделка</span>
        </button>
      </header>

      <div className={styles.toolbar}>
        <div>
          <div className={styles.titleRow}>
            <h2>{pipelineName}</h2>
            <button className={styles.titleMenu} type="button" aria-label="Настройки воронки" aria-expanded={pipelineMenuOpen} onClick={() => { setPipelineMenuOpen((value) => !value); setNotificationsOpen(false); }}>
              •••
            </button>
            {pipelineMenuOpen && <div className={styles.pipelineMenu}><button type="button" onClick={() => router.push("/settings")}>Настроить этапы <span>→</span></button><button type="button" onClick={exportDeals}>Экспортировать CSV <span>↓</span></button></div>}
          </div>
          <p>{visibleDealsCount === dealsCount ? `${dealsCount} активных сделок` : `${visibleDealsCount} из ${dealsCount} сделок`}</p>
        </div>

        <div className={styles.toolbarActions}>
          <div className={styles.viewSwitch}>
            <button className={view === "board" ? styles.viewActive : ""} type="button" onClick={() => setView("board")}>Доска</button>
            <button className={view === "list" ? styles.viewActive : ""} type="button" onClick={() => setView("list")}>Список</button>
          </div>
          <button className={`${styles.secondaryButton} ${filtersOpen || activeFilters ? styles.filtersActive : ""}`} type="button" onClick={() => setFiltersOpen((value) => !value)}>Фильтры{activeFilters > 0 && <span>{activeFilters}</span>}</button>
        </div>
      </div>

      {filtersOpen && <section className={styles.filterPanel}><label><span>Ответственный</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>{assignees.map((assignee) => <option key={assignee}>{assignee}</option>)}</select></label><label><span>Источник</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>Все</option><option value="Meta">Meta</option><option value="Website">Сайт</option><option value="Manual">Вручную</option></select></label><label><span>Задача</span><select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}><option>Все</option><option value="overdue">Просрочена</option><option value="due">На сегодня</option><option value="normal">Запланирована</option><option>Без задачи</option></select></label><div><strong>{visibleDealsCount}</strong><span>найдено</span></div><button type="button" disabled={!activeFilters} onClick={resetFilters}>Сбросить</button></section>}

      {loadState === "loading" ? <div className={styles.emptyDeals}><strong>Загружаем воронку…</strong><span>Получаем этапы и сделки из CRM.</span></div> : loadState === "error" ? <div className={styles.emptyDeals}><strong>Не удалось загрузить воронку</strong><span>Проверьте соединение и обновите страницу.</span></div> : view === "board" ? <DndContext
        id="pipeline-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDealId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.board}>
          {filteredStages.map((stage) => (
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
      </DndContext> : <DealList stages={filteredStages} onOpenDeal={(dealId, stageId) => setSelected({ dealId, stageId })} />}

      {selectedDeal && selectedStage && (
        <DealDrawer
          key={selectedDeal.id}
          deal={selectedDeal}
          stageId={selectedStage.id}
          stages={stageOptions}
          assignees={[{ id: user.id, name: user.name }]}
          activities={selectedActivities}
          onSave={saveDeal}
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
          contacts={contacts}
          assignees={[{ id: user.id, name: user.name }]}
          onCreate={createDeal}
          onClose={() => setNewDealStageId(null)}
        />
      )}
    </section>
  );
}

function DealList({ stages, onOpenDeal }: { stages: PipelineStage[]; onOpenDeal: (dealId: string, stageId: string) => void }) {
  const rows = stages.flatMap((stage) => stage.deals.map((deal) => ({ deal, stage })));

  if (!rows.length) return <div className={styles.emptyDeals}><strong>Сделки не найдены</strong><span>Измените запрос или сбросьте фильтры.</span></div>;

  return <div className={styles.listView}><header><span>Контакт</span><span>Сделка и запрос</span><span>Этап</span><span>Ответственный</span><span>Следующая задача</span></header>{rows.map(({ deal, stage }) => <button type="button" onClick={() => onOpenDeal(deal.id, stage.id)} key={deal.id}><span className={styles.listContact}><i>{deal.contactName.slice(0, 1)}</i><span><strong>{deal.contactName}</strong><small>Сделка #{deal.number} · {deal.phone}</small></span></span><span className={styles.listRequest}><strong>{deal.title || deal.request}</strong><small>{deal.request || "Запрос не указан"} · {deal.budget || "Бюджет не указан"}</small></span><span className={styles.listStage}><i style={{ backgroundColor: stage.color }} />{stage.title}</span><span>{deal.assignee}</span><span className={`${styles.listTask} ${deal.taskState ? styles[deal.taskState] : ""}`}>{deal.task || "Нет задачи"}</span><b>›</b></button>)}</div>;
}
