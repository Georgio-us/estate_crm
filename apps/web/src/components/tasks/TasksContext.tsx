"use client";

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { mockTasks } from "@/data/mock-tasks";
import type { CrmTask } from "@/types/crm";

interface TasksContextValue {
  tasks: CrmTask[];
  setTasks: Dispatch<SetStateAction<CrmTask[]>>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<CrmTask[]>(mockTasks);
  const value = useMemo(() => ({ tasks, setTasks }), [tasks]);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) throw new Error("useTasks must be used inside TasksProvider");
  return context;
}
