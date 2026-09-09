"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/components/auth/AuthContext";
import { kindToApi, mapApiTask, type ApiTask } from "@/lib/tasks";
import type { CrmTask, TaskKind } from "@/types/crm";

export interface TaskContactOption { id: string; name: string; phone: string | null }
export interface TaskDealOption { id: string; number: number; title: string; contactId: string }
export interface TaskAssigneeOption { id: string; name: string; role: "ADMIN" | "LEAD" | "MANAGER" }
export interface TaskDraftInput { title: string; kind: TaskKind; dueDate?: string; dueTime?: string; assigneeId?: string; contactId?: string; dealId?: string }

interface TasksContextValue {
  tasks: CrmTask[];
  contacts: TaskContactOption[];
  deals: TaskDealOption[];
  assignees: TaskAssigneeOption[];
  loadState: "loading" | "ready" | "error";
  createTask: (draft: TaskDraftInput) => Promise<CrmTask>;
  updateTask: (task: CrmTask) => Promise<CrmTask>;
  completeTask: (taskId: string, result: string) => Promise<CrmTask>;
  reloadTasks: () => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

async function requestTaskData() {
  const [tasksResponse, contactsResponse, pipelineResponse, assigneesResponse] = await Promise.all([
    fetch("/api/crm/tasks", { cache: "no-store" }),
    fetch("/api/crm/contacts", { cache: "no-store" }),
    fetch("/api/crm/pipeline", { cache: "no-store" }),
    fetch("/api/crm/team/assignees", { cache: "no-store" }),
  ]);
  if (!tasksResponse.ok || !contactsResponse.ok || !pipelineResponse.ok || !assigneesResponse.ok) throw new Error("Не удалось загрузить задачи.");
  const tasksPayload = await tasksResponse.json() as { tasks: ApiTask[] };
  const contactsPayload = await contactsResponse.json() as { contacts: TaskContactOption[] };
  const pipelinePayload = await pipelineResponse.json() as { pipeline: { stages: Array<{ deals: Array<{ id: string; number: number; title: string; contact: { id: string } }> }> } };
  const assigneesPayload = await assigneesResponse.json() as { assignees: TaskAssigneeOption[] };
  return {
    tasks: tasksPayload.tasks.map(mapApiTask),
    contacts: contactsPayload.contacts,
    deals: pipelinePayload.pipeline.stages.flatMap((stage) => stage.deals.map((deal) => ({ id: deal.id, number: deal.number, title: deal.title, contactId: deal.contact.id }))),
    assignees: assigneesPayload.assignees,
  };
}

async function taskRequest(url: string, method: string, body: object) {
  const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json() as { task?: ApiTask; message?: string };
  if (!response.ok || !payload.task) throw new Error(payload.message || "Не удалось сохранить задачу.");
  return mapApiTask(payload.task);
}

export function TasksProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [contacts, setContacts] = useState<TaskContactOption[]>([]);
  const [deals, setDeals] = useState<TaskDealOption[]>([]);
  const [assignees, setAssignees] = useState<TaskAssigneeOption[]>([{ id: user.id, name: user.name, role: user.organization.role }]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  async function reloadTasks() {
    try {
      const data = await requestTaskData();
      setTasks(data.tasks);
      setContacts(data.contacts);
      setDeals(data.deals);
      setAssignees(data.assignees);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    let active = true;
    void requestTaskData().then((data) => {
      if (!active) return;
      setTasks(data.tasks);
      setContacts(data.contacts);
      setDeals(data.deals);
      setAssignees(data.assignees);
      setLoadState("ready");
    }, () => { if (active) setLoadState("error"); });
    return () => { active = false; };
  }, []);

  async function createTask(draft: TaskDraftInput) {
    const task = await taskRequest("/api/crm/tasks", "POST", { ...draft, kind: kindToApi[draft.kind], assigneeId: draft.assigneeId || user.id, dueDate: draft.dueDate || null, dueTime: draft.dueTime || null, contactId: draft.contactId || null, dealId: draft.dealId || null });
    setTasks((current) => [task, ...current]);
    return task;
  }

  async function updateTask(next: CrmTask) {
    const task = await taskRequest(`/api/crm/tasks/${next.id}`, "PATCH", { title: next.title, kind: kindToApi[next.kind], status: next.period === "completed" ? "COMPLETED" : "ACTIVE", dueDate: next.dueDate || null, dueTime: next.dueTime || null, assigneeId: next.assigneeId || user.id, contactId: next.contactId || null, dealId: next.dealId || null, result: next.result || null });
    setTasks((current) => current.map((item) => item.id === task.id ? task : item));
    return task;
  }

  async function completeTask(taskId: string, result: string) {
    const task = await taskRequest(`/api/crm/tasks/${taskId}/complete`, "POST", { result });
    setTasks((current) => current.map((item) => item.id === task.id ? task : item));
    return task;
  }

  const value = { tasks, contacts, deals, assignees, loadState, createTask, updateTask, completeTask, reloadTasks };
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) throw new Error("useTasks must be used inside TasksProvider");
  return context;
}
