"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DragOverlay,
  DndContext,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { LogoMark } from "@/components/brand/LogoMark";
import { useTasks } from "@/components/tasks/TasksContext";
import { normalizePhone } from "@/lib/phone";
import { localDateKey } from "@/lib/tasks";
import { mapApiActivity, type ApiActivity } from "@/lib/activity";
import type { ActivityEvent, CrmTask, Deal, DealStatus, PipelineStage } from "@/types/crm";
import { DealDrawer } from "./DealDrawer";
import { DealCardPreview } from "./DealCard";
import { NewDealModal, type NewDealDraft } from "./NewDealModal";
import { PipelineDataTransfer, type ImportedDealRow } from "./PipelineDataTransfer";
import { PipelineColumn } from "./PipelineColumn";
import styles from "./pipeline.module.css";

const sourceFromApi = { META: "Meta", WEBSITE: "Website", MANUAL: "Manual" } as const;
const sourceToApi = { Meta: "META", Website: "WEBSITE", Manual: "MANUAL" } as const;
const operationFromApi = { PURCHASE: "Покупка", RENT: "Аренда", SALE: "Продажа" } as const;
const operationToApi = { Покупка: "PURCHASE", Аренда: "RENT", Продажа: "SALE" } as const;

const transferHeaders = ["ID сделки", "Номер", "Название сделки", "ID контакта", "Контакт", "Телефон", "Запрос", "ID этапа", "Этап", "ID ответственного", "Ответственный", "Источник", "Бюджет", "Операция", "Тип объекта", "Район", "Комнаты", "Комментарий", "Статус"];

function importedValue(row: ImportedDealRow, ...headers: string[]): string | undefined {
  const entries = Object.entries(row);
  for (const header of headers) {
    const match = entries.find(([key]) => key.trim().toLocaleLowerCase("ru-RU") === header.toLocaleLowerCase("ru-RU"));
    if (match) return match[1].replace(/^'(?=[=+@-])/, "").trim();
  }
  return undefined;
}

function importedSource(value: string | undefined): keyof typeof sourceFromApi {
  const normalized = value?.trim().toLocaleLowerCase("ru-RU");
  if (normalized === "meta") return "META";
  if (normalized === "website" || normalized === "сайт") return "WEBSITE";
  return "MANUAL";
}

function importedOperation(value: string | undefined): keyof typeof operationFromApi {
  const normalized = value?.trim().toLocaleLowerCase("ru-RU");
  if (normalized === "rent" || normalized === "аренда") return "RENT";
  if (normalized === "sale" || normalized === "продажа") return "SALE";
  return "PURCHASE";
}

function compareTasks(first: CrmTask, second: CrmTask) {
  const firstKey = `${first.dueDate || "9999-12-31"}T${first.dueTime || "23:59"}`;
  const secondKey = `${second.dueDate || "9999-12-31"}T${second.dueTime || "23:59"}`;
  return firstKey.localeCompare(secondKey);
}

function taskState(task: CrmTask): Deal["taskState"] {
  if (task.period === "overdue") return "overdue";
  if (task.period === "today") return "due";
  return "normal";
}

const pipelineCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length) {
    const collisionMeta = (id: string | number) => (
      args.droppableContainers.find((container) => container.id === id)?.data.current as
        | { type?: "stage" | "deal"; stageId?: string }
        | undefined
    );
    const stageCollision = pointerCollisions.find(({ id }) => collisionMeta(id)?.type === "stage");

    if (stageCollision) {
      const stageId = collisionMeta(stageCollision.id)?.stageId;
      const cardCollision = pointerCollisions.find(({ id }) => {
        const meta = collisionMeta(id);
        return meta?.type === "deal" && meta.stageId === stageId;
      });
      return cardCollision ? [cardCollision] : [stageCollision];
    }

    return [pointerCollisions[0]!];
  }

  const intersections = rectIntersection(args);
  return intersections.length ? intersections : closestCorners(args);
};

interface ApiDeal {
  id: string;
  number: number;
  contact: { id: string; name: string; phone: string | null };
  relatedContacts: Array<{ id: string; name: string; phone: string | null }>;
  nextTask: { id: string; title: string; dueDate: string | null; dueTime: string | null } | null;
  title: string;
  request: string;
  budget: string | null;
  operation: keyof typeof operationFromApi;
  propertyType: string | null;
  district: string | null;
  rooms: string | null;
  source: keyof typeof sourceFromApi;
  status: DealStatus;
  closedAt: string | null;
  assignee: { id: string; name: string } | null;
  comment: string | null;
  createdAt: string;
}

interface ApiStage { id: string; title: string; color: string; position: number; deals: ApiDeal[] }
interface ContactOption { id: string; name: string; phone: string | null; source: Deal["source"]; dealIds?: string[]; dealCount?: number }

function mapApiDeal(deal: ApiDeal): Deal {
  return {
    id: deal.id,
    number: deal.number,
    contactId: deal.contact.id,
    title: deal.title,
    contactName: deal.contact.name,
    phone: deal.contact.phone || "",
    relatedContacts: deal.relatedContacts || [],
    task: deal.nextTask?.title,
    taskId: deal.nextTask?.id,
    taskState: deal.nextTask ? (deal.nextTask.dueDate && deal.nextTask.dueDate < localDateKey() ? "overdue" : deal.nextTask.dueDate === localDateKey() ? "due" : "normal") : undefined,
    request: deal.request,
    budget: deal.budget || undefined,
    operation: operationFromApi[deal.operation],
    propertyType: deal.propertyType || undefined,
    district: deal.district || undefined,
    rooms: deal.rooms || undefined,
    source: sourceFromApi[deal.source],
    status: deal.status,
    closedAt: deal.closedAt || undefined,
    assigneeId: deal.assignee?.id,
    assignee: deal.assignee?.name || "Не назначен",
    comment: deal.comment || undefined,
    createdAt: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(deal.createdAt)),
  };
}

async function requestPipeline(view: "active" | "closed" | "all" = "active"): Promise<{ name: string; stages: PipelineStage[] }> {
  const response = await fetch(`/api/crm/pipeline?view=${view}`, { cache: "no-store" });
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
  const payload = await response.json() as { contacts: Array<Omit<ContactOption, "source"> & { source: keyof typeof sourceFromApi }> };
  return payload.contacts.map((contact) => ({ ...contact, source: sourceFromApi[contact.source], dealCount: contact.dealIds?.length || 0 }));
}

async function requestDealActivities(dealId: string): Promise<ActivityEvent[]> {
  const response = await fetch(`/api/crm/deals/${dealId}/activities`, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить историю сделки.");
  const payload = await response.json() as { activities: ApiActivity[] };
  return payload.activities.map(mapApiActivity);
}

export function PipelineBoard() {
  const router = useRouter();
  const pipelineMenuRef = useRef<HTMLDivElement>(null);
  const deepLinkHandledRef = useRef(false);
  const user = useCurrentUser();
  const { tasks, assignees: teamAssignees, createTask, completeTask: persistCompleteTask } = useTasks();
  const [pipelineName, setPipelineName] = useState("Продажа недвижимости");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [activities, setActivities] = useState<Record<string, ActivityEvent[]>>({});
  const [selected, setSelected] = useState<{ dealId: string; stageId: string; composer?: "note" | "task"; taskId?: string } | null>(null);
  const [newDealStageId, setNewDealStageId] = useState<string | null>(null);
  const [newDealContactId, setNewDealContactId] = useState<string | null>(null);
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState("Все");
  const [sourceFilter, setSourceFilter] = useState("Все");
  const [taskFilter, setTaskFilter] = useState("Все");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [pipelineMenuOpen, setPipelineMenuOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [pipelineView, setPipelineView] = useState<"active" | "closed">("active");
  const [notice, setNotice] = useState("");
  const readDealsStorageKey = `estate-crm:read-deals:${user.organization.id}:${user.id}`;
  const [readDealIds, setReadDealIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = JSON.parse(window.localStorage.getItem(readDealsStorageKey) || "[]") as string[];
      return new Set(saved);
    } catch {
      return new Set();
    }
  });

  const markDealRead = useCallback((dealId: string) => {
    setReadDealIds((current) => {
      if (current.has(dealId)) return current;
      const next = new Set(current);
      next.add(dealId);
      window.localStorage.setItem(readDealsStorageKey, JSON.stringify([...next]));
      return next;
    });
  }, [readDealsStorageKey]);

  function openDeal(dealId: string, stageId: string) {
    markDealRead(dealId);
    setSelected({ dealId, stageId });
  }

  useEffect(() => {
    let active = true;
    void Promise.all([requestPipeline(pipelineView), requestContactOptions()]).then(
      ([pipeline, contactOptions]) => {
        if (!active) return;
        setPipelineName(pipeline.name);
        setStages(pipeline.stages);
        setContacts(contactOptions);
        setLoadState("ready");
        if (!deepLinkHandledRef.current) {
          const parameters = new URLSearchParams(window.location.search);
          const newDealContact = parameters.get("newDealContact");
          const dealId = parameters.get("deal");
          const stage = dealId ? pipeline.stages.find((item) => item.deals.some((deal) => deal.id === dealId)) : undefined;
          if (newDealContact && contactOptions.some((contact) => contact.id === newDealContact) && pipeline.stages[0]) {
            deepLinkHandledRef.current = true;
            setNewDealContactId(newDealContact);
            setNewDealStageId(pipeline.stages[0].id);
          } else if (dealId && stage) {
            deepLinkHandledRef.current = true;
            markDealRead(dealId);
            setSelected({ dealId, stageId: stage.id, taskId: parameters.get("task") || undefined });
          }
        }
      },
      () => { if (active) setLoadState("error"); },
    );
    return () => { active = false; };
  }, [markDealRead, pipelineView]);

  useEffect(() => {
    if (!pipelineMenuOpen) return;
    function closePipelineMenu(event: PointerEvent) {
      if (!pipelineMenuRef.current?.contains(event.target as Node)) setPipelineMenuOpen(false);
    }
    document.addEventListener("pointerdown", closePipelineMenu);
    return () => document.removeEventListener("pointerdown", closePipelineMenu);
  }, [pipelineMenuOpen]);

  useEffect(() => {
    if (!selected?.dealId) return;
    const dealId = selected.dealId;
    let active = true;
    void requestDealActivities(dealId).then((items) => {
      if (active) setActivities((current) => ({ ...current, [dealId]: items }));
    }, () => undefined);
    return () => { active = false; };
  }, [selected?.dealId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3_500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function reloadPipeline() {
    try {
      const pipeline = await requestPipeline(pipelineView);
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

  async function updateDealLifecycle(dealId: string, status: DealStatus) {
    const response = await fetch(`/api/crm/deals/${dealId}/lifecycle`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = await response.json() as { deal?: ApiDeal; stageId?: string; message?: string };
    if (!response.ok || !payload.deal || !payload.stageId) throw new Error(payload.message || "Не удалось изменить состояние сделки.");

    const updatedDeal = mapApiDeal(payload.deal);
    const remainsVisible = pipelineView === "active" ? status === "ACTIVE" : status !== "ACTIVE";
    setStages((current) => current.map((stage) => ({
      ...stage,
      deals: stage.deals.flatMap((deal) => deal.id === dealId ? (remainsVisible ? [updatedDeal] : []) : [deal]),
    })));
    if (!remainsVisible) setSelected((current) => current?.dealId === dealId ? null : current);
    setNotice(status === "ACTIVE" ? "Сделка возвращена в работу" : status === "WON" ? "Сделка успешно завершена" : status === "LOST" ? "Сделка закрыта как неуспешная" : "Сделка перенесена в архив");
  }

  async function runDealLifecycle(dealId: string, status: DealStatus) {
    try {
      await updateDealLifecycle(dealId, status);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Не удалось изменить состояние сделки");
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const stagesWithTasks = useMemo(() => stages.map((stage) => ({
    ...stage,
    deals: stage.deals.map((deal) => {
      const dealTasks = tasks
        .filter((task) => task.dealId === deal.id && task.period !== "completed")
        .sort(compareTasks);
      const nextTask = dealTasks[0];
      return {
        ...deal,
        task: nextTask?.title,
        taskId: nextTask?.id,
        taskState: nextTask ? taskState(nextTask) : undefined,
        taskCount: dealTasks.length,
        taskDueLabel: nextTask ? `${nextTask.dueLabel}${nextTask.dueTime ? `, ${nextTask.dueTime}` : ""}` : undefined,
      };
    }),
  })), [stages, tasks]);
  const dealsCount = stagesWithTasks.reduce((total, stage) => total + stage.deals.length, 0);
  const assignees = useMemo(() => ["Все", ...new Set(stagesWithTasks.flatMap((stage) => stage.deals.map((deal) => deal.assignee)))], [stagesWithTasks]);
  const activeFilters = [assigneeFilter, sourceFilter, taskFilter].filter((value) => value !== "Все").length;
  const filteredStages = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return stagesWithTasks.map((stage) => ({
      ...stage,
      deals: stage.deals.filter((deal) => {
        const matchesQuery = !normalized || `${deal.title || ""} ${deal.contactName} ${deal.phone} ${deal.request} ${deal.number}`.toLocaleLowerCase("ru").includes(normalized);
        const matchesAssignee = assigneeFilter === "Все" || deal.assignee === assigneeFilter;
        const matchesSource = sourceFilter === "Все" || deal.source === sourceFilter;
        const matchesTask = taskFilter === "Все" || (taskFilter === "Без задачи" ? !deal.task : deal.taskState === taskFilter);
        return matchesQuery && matchesAssignee && matchesSource && matchesTask;
      }),
    }));
  }, [assigneeFilter, query, sourceFilter, stagesWithTasks, taskFilter]);
  const visibleDealsCount = filteredStages.reduce((total, stage) => total + stage.deals.length, 0);
  const selectedStage = selected ? stagesWithTasks.find((stage) => stage.id === selected.stageId) : undefined;
  const selectedDeal = selectedStage?.deals.find((deal) => deal.id === selected?.dealId);
  const selectedTasks = selected ? tasks.filter((task) => task.dealId === selected.dealId && task.period !== "completed").sort(compareTasks) : [];

  const stageOptions = useMemo(
    () => stages.map(({ id, title }) => ({ id, title })),
    [stages],
  );

  const selectedActivities = selected ? activities[selected.dealId] || [] : [];
  const activeDeal = activeDealId
    ? stagesWithTasks.flatMap((stage) => stage.deals).find((deal) => deal.id === activeDealId)
    : undefined;
  const notificationTasks = tasks.filter((task) => task.period === "overdue" || task.period === "today").sort(compareTasks);

  function openTaskDeal(task: CrmTask) {
    if (!task.dealId) {
      router.push("/tasks");
      return;
    }
    const stage = stagesWithTasks.find((item) => item.deals.some((deal) => deal.id === task.dealId));
    if (stage) setSelected({ dealId: task.dealId, stageId: stage.id, taskId: task.id });
    else router.push(`/?deal=${task.dealId}&task=${task.id}`);
  }

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
    const refreshedActivities = await requestDealActivities(savedDeal.id);
    setActivities((current) => ({ ...current, [savedDeal.id]: refreshedActivities }));
    return { deal: savedDeal, stageId: payload.stageId };
  }

  async function updateContactPhone(phone: string) {
    if (!selectedDeal?.contactId) throw new Error("У сделки нет основного контакта.");
    const contactId = selectedDeal.contactId;
    const response = await fetch(`/api/crm/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const payload = await response.json() as { contact?: { phone: string | null }; message?: string };
    if (!response.ok || !payload.contact) throw new Error(payload.message || "Не удалось обновить телефон контакта.");
    const savedPhone = payload.contact.phone || "";
    setContacts((current) => current.map((contact) => contact.id === contactId ? { ...contact, phone: savedPhone } : contact));
    setStages((current) => current.map((stage) => ({ ...stage, deals: stage.deals.map((deal) => deal.contactId === contactId ? { ...deal, phone: savedPhone } : deal) })));
    return savedPhone;
  }

  async function addNote(text: string) {
    if (!selected) throw new Error("Сделка больше не открыта.");
    const response = await fetch(`/api/crm/deals/${selected.dealId}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const payload = await response.json() as { activity?: ApiActivity; message?: string };
    if (!response.ok || !payload.activity) throw new Error(payload.message || "Не удалось сохранить примечание.");
    const activity = mapApiActivity(payload.activity);
    setActivities((current) => ({
      ...current,
      [selected.dealId]: [activity, ...(current[selected.dealId] || [])],
    }));
  }

  async function linkContact(contactId: string) {
    if (!selected) throw new Error("Сделка больше не открыта.");
    const response = await fetch(`/api/crm/deals/${selected.dealId}/contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId }),
    });
    const payload = await response.json() as { deal?: ApiDeal; stageId?: string; message?: string };
    if (!response.ok || !payload.deal || !payload.stageId) throw new Error(payload.message || "Не удалось связать контакт.");
    const savedDeal = mapApiDeal(payload.deal);
    setStages((current) => current.map((stage) => ({ ...stage, deals: stage.deals.map((deal) => deal.id === savedDeal.id ? savedDeal : deal) })));
    const refreshedActivities = await requestDealActivities(savedDeal.id);
    setActivities((current) => ({ ...current, [savedDeal.id]: refreshedActivities }));
  }

  async function unlinkContact(contactId: string) {
    if (!selected) throw new Error("Сделка больше не открыта.");
    const response = await fetch(`/api/crm/deals/${selected.dealId}/contacts/${contactId}`, { method: "DELETE" });
    const payload = await response.json() as { deal?: ApiDeal; stageId?: string; message?: string };
    if (!response.ok || !payload.deal || !payload.stageId) throw new Error(payload.message || "Не удалось удалить связь.");
    const savedDeal = mapApiDeal(payload.deal);
    setStages((current) => current.map((stage) => ({ ...stage, deals: stage.deals.map((deal) => deal.id === savedDeal.id ? savedDeal : deal) })));
    const refreshedActivities = await requestDealActivities(savedDeal.id);
    setActivities((current) => ({ ...current, [savedDeal.id]: refreshedActivities }));
  }

  async function addTask(draft: { title: string; dueDate?: string; dueTime?: string }) {
    if (!selected || !selectedDeal) throw new Error("Сделка больше не открыта.");
    await createTask({ ...draft, kind: "Звонок", dealId: selected.dealId, contactId: selectedDeal.contactId, assigneeId: selectedDeal.assigneeId || user.id });
    const refreshedActivities = await requestDealActivities(selected.dealId);
    setActivities((current) => ({ ...current, [selected.dealId]: refreshedActivities }));
  }

  async function completeTask(taskId: string, result: string) {
    if (!selected) return;
    await persistCompleteTask(taskId, result);
    const refreshedActivities = await requestDealActivities(selected.dealId);
    setActivities((current) => ({ ...current, [selected.dealId]: refreshedActivities }));
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
        description: draft.source === "Manual" ? "Источник не указан" : `Источник ${draft.source}`,
        author: user.name,
        occurredAt: currentTime(),
      }],
    }));
    setNewDealStageId(null);
    setNewDealContactId(null);
    setSelected({ dealId, stageId: draft.stageId });
    if (!draft.contactId && deal.contactId) {
      setContacts((current) => current.some((item) => item.id === deal.contactId) ? current : [{ id: deal.contactId!, name: deal.contactName, phone: deal.phone || null, source: deal.source, dealCount: 1 }, ...current]);
    } else if (draft.contactId) {
      setContacts((current) => current.map((contact) => contact.id === draft.contactId ? { ...contact, dealCount: (contact.dealCount || 0) + 1 } : contact));
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

  async function importDeals(rows: ImportedDealRow[]) {
    const summary = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
    const [allPipeline, contactOptions] = await Promise.all([requestPipeline("all"), requestContactOptions()]);
    const allDeals = allPipeline.stages.flatMap((stage) => stage.deals.map((deal) => ({ deal, stageId: stage.id })));
    const dealsById = new Map(allDeals.map(({ deal }) => [deal.id, deal]));
    const stagesById = new Map(allPipeline.stages.map((stage) => [stage.id, stage]));
    const stagesByTitle = new Map(allPipeline.stages.map((stage) => [stage.title.trim().toLocaleLowerCase("ru-RU"), stage]));
    const contactsById = new Map(contactOptions.map((contact) => [contact.id, contact]));
    const contactsByPhone = new Map(contactOptions.filter((contact) => contact.phone).map((contact) => [normalizePhone(contact.phone || ""), contact]));
    const knownDealKeys = new Set(allDeals.map(({ deal, stageId }) => `${stageId}|${normalizePhone(deal.phone)}|${(deal.title || deal.request || deal.contactName).trim().toLocaleLowerCase("ru-RU")}`));

    for (const [index, row] of rows.entries()) {
      try {
        const stageIdValue = importedValue(row, "ID этапа", "Stage ID");
        const stageTitle = importedValue(row, "Этап", "Stage");
        const stage = (stageIdValue ? stagesById.get(stageIdValue) : undefined) || (stageTitle ? stagesByTitle.get(stageTitle.toLocaleLowerCase("ru-RU")) : undefined);
        if (!stage) throw new Error(`этап «${stageTitle || stageIdValue || "не указан"}» не найден`);

        const dealId = importedValue(row, "ID сделки", "Deal ID");
        const contactName = importedValue(row, "Контакт", "Contact") || "";
        const phone = importedValue(row, "Телефон", "Phone") || "";
        const title = importedValue(row, "Название сделки", "Deal title", "Название") || importedValue(row, "Запрос", "Request") || contactName;
        const request = importedValue(row, "Запрос", "Request");
        const budget = importedValue(row, "Бюджет", "Budget");
        const propertyType = importedValue(row, "Тип объекта", "Property type");
        const district = importedValue(row, "Район", "District");
        const rooms = importedValue(row, "Комнаты", "Rooms");
        const comment = importedValue(row, "Комментарий", "Comment");
        const sourceValue = importedValue(row, "Источник", "Source");
        const operationValue = importedValue(row, "Операция", "Operation");
        const source = importedSource(sourceValue);
        const operation = importedOperation(operationValue);
        const assigneeId = importedValue(row, "ID ответственного", "Assignee ID");

        if (dealId) {
          const existing = dealsById.get(dealId);
          const response = await fetch(`/api/crm/deals/${dealId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              stageId: stage.id,
              ...(title ? { title } : {}),
              ...(request !== undefined ? { request } : {}),
              ...(budget !== undefined ? { budget: budget || null } : {}),
              ...(propertyType !== undefined ? { propertyType: propertyType || null } : {}),
              ...(district !== undefined ? { district: district || null } : {}),
              ...(rooms !== undefined ? { rooms: rooms || null } : {}),
              ...(comment !== undefined ? { comment: comment || null } : {}),
              ...(assigneeId !== undefined ? { assigneeId: assigneeId || null } : {}),
              ...(sourceValue !== undefined ? { source } : {}),
              ...(operationValue !== undefined ? { operation } : {}),
            }),
          });
          const payload = await response.json() as { deal?: ApiDeal; message?: string };
          if (!response.ok || !payload.deal) throw new Error(payload.message || (existing ? "не удалось обновить сделку" : "сделка с таким ID не найдена"));
          dealsById.set(dealId, mapApiDeal(payload.deal));
          summary.updated += 1;
          continue;
        }

        if (!contactName) throw new Error("не указан контакт");
        const normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) throw new Error("не указан телефон");
        const contactIdValue = importedValue(row, "ID контакта", "Contact ID");
        const contact = (contactIdValue ? contactsById.get(contactIdValue) : undefined) || contactsByPhone.get(normalizedPhone);
        const duplicateKey = `${stage.id}|${normalizedPhone}|${title.trim().toLocaleLowerCase("ru-RU")}`;
        if (knownDealKeys.has(duplicateKey)) {
          summary.skipped += 1;
          continue;
        }

        const response = await fetch("/api/crm/deals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stageId: stage.id,
            contactId: contact?.id,
            contactName: contact ? undefined : contactName,
            phone: contact ? undefined : phone,
            assigneeId: assigneeId || null,
            title: title || contactName,
            request: request || "",
            budget: budget || undefined,
            propertyType: propertyType || undefined,
            district: district || undefined,
            rooms: rooms || undefined,
            comment: comment || undefined,
            source,
            operation,
          }),
        });
        const payload = await response.json() as { deal?: ApiDeal; message?: string };
        if (!response.ok || !payload.deal) throw new Error(payload.message || "не удалось создать сделку");
        const createdDeal = mapApiDeal(payload.deal);
        knownDealKeys.add(duplicateKey);
        if (!contact) {
          const createdContact = { id: createdDeal.contactId!, name: createdDeal.contactName, phone: createdDeal.phone, source: createdDeal.source };
          contactsById.set(createdContact.id, createdContact);
          contactsByPhone.set(normalizedPhone, createdContact);
        }
        summary.created += 1;
      } catch (error) {
        summary.skipped += 1;
        summary.errors.push(`Строка ${index + 2}: ${error instanceof Error ? error.message : "неизвестная ошибка"}`);
      }
    }

    const [refreshedPipeline, refreshedContacts] = await Promise.all([requestPipeline(pipelineView), requestContactOptions()]);
    setPipelineName(refreshedPipeline.name);
    setStages(refreshedPipeline.stages);
    setContacts(refreshedContacts);
    setLoadState("ready");
    return summary;
  }

  const transferRows = [transferHeaders, ...stages.flatMap((stage) => stage.deals.map((deal) => [
    deal.id,
    String(deal.number),
    deal.title || deal.request || deal.contactName,
    deal.contactId || "",
    deal.contactName,
    deal.phone,
    deal.request,
    stage.id,
    stage.title,
    deal.assigneeId || "",
    deal.assignee,
    deal.source === "Website" ? "Сайт" : deal.source === "Manual" ? "Не указан" : "Meta",
    deal.budget || "",
    deal.operation || "Покупка",
    deal.propertyType || "",
    deal.district || "",
    deal.rooms || "",
    deal.comment || "",
    deal.status === "WON" ? "Успешно" : deal.status === "LOST" ? "Неуспешно" : deal.status === "ARCHIVED" ? "Архив" : "Активна",
  ]))];

  return (
    <section className={styles.page}>
      <header className={styles.topbar}>
        <LogoMark className={styles.mobileBrand} title="Estate CRM" />
        <h1>Воронка</h1>

        <label className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input type="search" placeholder="Поиск по сделкам" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>

        <div className={styles.notificationWrap}>
        <button className={styles.iconButton} type="button" aria-label={`Уведомления: ${notificationTasks.length}`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); setPipelineMenuOpen(false); }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
          {notificationTasks.length > 0 && <span className={styles.notificationDot} />}
        </button>
        {notificationsOpen && <div className={styles.notificationPanel}><header><strong>Задачи требуют внимания</strong><span>{notificationTasks.length}</span></header>{notificationTasks.slice(0, 5).map((task) => <button type="button" key={task.id} onClick={() => { setNotificationsOpen(false); openTaskDeal(task); }}><i className={task.period === "overdue" ? styles.alertRed : styles.alertAmber}>{task.period === "overdue" ? "!" : "○"}</i><span><strong>{task.period === "overdue" ? "Просрочена задача" : "Задача на сегодня"}</strong><small>{task.contactName || "Без контакта"} · {task.title}</small></span><time>{task.dueTime || task.dueLabel}</time></button>)}{notificationTasks.length === 0 && <div className={styles.notificationEmpty}>На сегодня нет задач, требующих внимания.</div>}<footer><button type="button" onClick={() => router.push("/tasks")}>Открыть все задачи</button></footer></div>}
        </div>
        <button className={styles.primaryButton} type="button" disabled={!stages.length} onClick={() => { setNewDealContactId(null); if (stages[0]) setNewDealStageId(stages[0].id); }}>
          <span aria-hidden="true">＋</span><span className={styles.actionLabel}>Новая сделка</span>
        </button>
      </header>

      <div className={styles.toolbar}>
        <div>
          <div className={styles.titleRow} ref={pipelineMenuRef}>
            <h2>{pipelineName}</h2>
            <button className={styles.titleMenu} type="button" aria-label="Настройки воронки" aria-expanded={pipelineMenuOpen} onClick={() => { setPipelineMenuOpen((value) => !value); setNotificationsOpen(false); }}>
              •••
            </button>
            {pipelineMenuOpen && <div className={styles.pipelineMenu}>{user.organization.role === "ADMIN" && <button type="button" onClick={() => { setPipelineMenuOpen(false); router.push("/settings"); }}>Настроить этапы <span>→</span></button>}<button type="button" onClick={() => { setPipelineMenuOpen(false); setTransferOpen(true); }}>Импорт и экспорт <span>⇅</span></button></div>}
          </div>
          <p>{visibleDealsCount === dealsCount ? `${dealsCount} ${pipelineView === "active" ? "активных" : "закрытых"} сделок` : `${visibleDealsCount} из ${dealsCount} сделок`}</p>
        </div>

        <div className={styles.toolbarActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => { setLoadState("loading"); setPipelineView((current) => current === "active" ? "closed" : "active"); }}>{pipelineView === "active" ? "Закрытые" : "← Активные"}</button>
          {pipelineView === "active" && (
          <div className={styles.viewSwitch}>
            <button className={view === "board" ? styles.viewActive : ""} type="button" onClick={() => setView("board")}>Доска</button>
            <button className={view === "list" ? styles.viewActive : ""} type="button" onClick={() => setView("list")}>Список</button>
          </div>
          )}
          <button className={`${styles.secondaryButton} ${filtersOpen || activeFilters ? styles.filtersActive : ""}`} type="button" onClick={() => setFiltersOpen((value) => !value)}>Фильтры{activeFilters > 0 && <span>{activeFilters}</span>}</button>
        </div>
      </div>

      {filtersOpen && <section className={styles.filterPanel}><label><span>Ответственный</span><select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>{assignees.map((assignee) => <option key={assignee}>{assignee}</option>)}</select></label><label><span>Источник</span><select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>Все</option><option value="Meta">Meta</option><option value="Website">Сайт</option><option value="Manual">Не указан</option></select></label><label><span>Задача</span><select value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}><option>Все</option><option value="overdue">Просрочена</option><option value="due">На сегодня</option><option value="normal">Запланирована</option><option>Без задачи</option></select></label><div><strong>{visibleDealsCount}</strong><span>найдено</span></div><button type="button" disabled={!activeFilters} onClick={resetFilters}>Сбросить</button></section>}

      {loadState === "loading" ? <div className={styles.emptyDeals}><strong>Загружаем воронку…</strong><span>Получаем этапы и сделки из CRM.</span></div> : loadState === "error" ? <div className={styles.emptyDeals}><strong>Не удалось загрузить воронку</strong><span>Проверьте соединение и обновите страницу.</span></div> : pipelineView === "active" && view === "board" ? <DndContext
        id="pipeline-dnd"
        sensors={sensors}
        collisionDetection={pipelineCollisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDealId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.board}>
          {filteredStages.map((stage) => (
            <PipelineColumn
              stage={stage}
              key={stage.id}
              readDealIds={readDealIds}
              onOpenDeal={(dealId) => openDeal(dealId, stage.id)}
              onAddTask={(dealId) => setSelected({ dealId, stageId: stage.id, composer: "task" })}
              onLifecycle={(dealId, status) => runDealLifecycle(dealId, status)}
              onAddDeal={() => { setNewDealContactId(null); setNewDealStageId(stage.id); }}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
          {activeDeal ? <DealCardPreview deal={activeDeal} /> : null}
        </DragOverlay>
      </DndContext> : <DealList stages={filteredStages} closed={pipelineView === "closed"} onRestore={(dealId) => runDealLifecycle(dealId, "ACTIVE")} onOpenDeal={(dealId, stageId) => setSelected({ dealId, stageId })} />}

      {selectedDeal && selectedStage && (
        <DealDrawer
          key={selectedDeal.id}
          deal={selectedDeal}
          stageId={selectedStage.id}
          stages={stageOptions}
          assignees={teamAssignees}
          activities={selectedActivities}
          tasks={selectedTasks}
          highlightedTaskId={selected?.taskId}
          contacts={contacts.map(({ id, name, phone }) => ({ id, name, phone }))}
          initialComposerMode={selected?.composer}
          onSave={saveDeal}
          onUpdateContactPhone={updateContactPhone}
          onAddNote={addNote}
          onLinkContact={linkContact}
          onUnlinkContact={unlinkContact}
          onAddTask={addTask}
          onCompleteTask={completeTask}
          onLifecycle={(status) => runDealLifecycle(selectedDeal.id, status)}
          onOpenContact={(contactId) => router.push(`/contacts?contact=${contactId}`)}
          onClose={() => {
            setSelected(null);
            if (window.location.search) router.replace("/");
          }}
        />
      )}

      {transferOpen && (
        <PipelineDataTransfer
          rows={transferRows}
          viewLabel={`${dealsCount} ${pipelineView === "active" ? "активных" : "закрытых"} сделок`}
          onImport={importDeals}
          onClose={() => setTransferOpen(false)}
        />
      )}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      {newDealStageId && (
        <NewDealModal
          initialStageId={newDealStageId}
          initialContactId={newDealContactId || undefined}
          stages={stageOptions}
          contacts={contacts}
          assignees={teamAssignees}
          onCreate={createDeal}
          onClose={() => { setNewDealStageId(null); setNewDealContactId(null); if (window.location.search) router.replace("/"); }}
        />
      )}
    </section>
  );
}

function DealList({ stages, closed = false, onRestore, onOpenDeal }: { stages: PipelineStage[]; closed?: boolean; onRestore?: (dealId: string) => Promise<void>; onOpenDeal: (dealId: string, stageId: string) => void }) {
  const rows = stages.flatMap((stage) => stage.deals.map((deal) => ({ deal, stage })));

  if (!rows.length) return <div className={styles.emptyDeals}><strong>Сделки не найдены</strong><span>Измените запрос или сбросьте фильтры.</span></div>;

  return <div className={styles.listView}><header><span>Контакт</span><span>Сделка и запрос</span><span>Этап</span><span>Ответственный</span><span>{closed ? "Состояние" : "Следующая задача"}</span></header>{rows.map(({ deal, stage }) => <div className={styles.listRow} role="button" tabIndex={0} onClick={() => onOpenDeal(deal.id, stage.id)} onKeyDown={(event) => { if (event.key === "Enter") onOpenDeal(deal.id, stage.id); }} key={deal.id}><span className={styles.listContact}><i>{deal.contactName.slice(0, 1)}</i><span><strong>{deal.contactName}</strong><small>Сделка #{deal.number} · {deal.phone}</small></span></span><span className={styles.listRequest}><strong>{deal.title || deal.request}</strong><small>{deal.request || "Запрос не указан"} · {deal.budget || "Бюджет не указан"}</small></span><span className={styles.listStage}><i style={{ backgroundColor: stage.color }} />{stage.title}</span><span>{deal.assignee}</span>{closed ? <span className={`${styles.lifecycleBadge} ${styles[`lifecycle${deal.status}`]}`}>{deal.status === "WON" ? "Успешно" : deal.status === "LOST" ? "Неуспешно" : "Архив"}</span> : <span className={`${styles.listTask} ${deal.taskState ? styles[deal.taskState] : ""}`}>{deal.task || "Нет задачи"}</span>}{closed && onRestore ? <button className={styles.restoreButton} type="button" title="Вернуть сделку в работу" aria-label="Вернуть сделку в работу" onClick={(event) => { event.stopPropagation(); void onRestore(deal.id); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h10a6 6 0 1 1-5.2 9" /><path d="m8 5-4 4 4 4" /></svg></button> : <b>›</b>}</div>)}</div>;
}
