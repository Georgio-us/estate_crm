export type DealPriority = "low" | "medium" | "high";

export interface Deal {
  id: string;
  number: number;
  contactName: string;
  phone: string;
  request: string;
  budget?: string;
  operation?: "Покупка" | "Аренда" | "Продажа";
  propertyType?: string;
  district?: string;
  rooms?: string;
  comment?: string;
  createdAt?: string;
  source: "Meta" | "Website" | "Manual";
  assignee: string;
  task?: string;
  taskState?: "normal" | "due" | "overdue";
  priority?: DealPriority;
}

export interface PipelineStage {
  id: string;
  title: string;
  color: string;
  deals: Deal[];
}

export type ActivityCategory = "note" | "task" | "change" | "source" | "object";

export interface ActivityEvent {
  id: string;
  dealId: string;
  category: ActivityCategory;
  title: string;
  description?: string;
  author?: string;
  occurredAt: string;
}

export type PropertyCategory = "Квартира" | "Дом" | "Участок" | "Коммерция";
export type PropertyMarket = "Первичный" | "Вторичный";
export type PropertyStatus = "Доступен" | "Резерв" | "Продан";

export interface PropertyListing {
  id: string;
  code: string;
  title: string;
  address: string;
  district: string;
  category: PropertyCategory;
  market: PropertyMarket;
  operation: "Продажа" | "Аренда";
  status: PropertyStatus;
  price: number;
  currency: "USD" | "EUR";
  rooms?: string;
  area: number;
  floor?: number;
  totalFloors?: number;
  landArea?: number;
  project?: string;
  developer?: string;
  description: string;
  imageUrl: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  telegram?: string;
  source: Deal["source"];
  assignee: string;
  dealIds: string[];
  lastContact: string;
  nextTask?: string;
  comment?: string;
  createdAt: string;
}

export type TaskKind = "Звонок" | "Встреча" | "Сообщение" | "Другое";
export type TaskPeriod = "overdue" | "today" | "upcoming" | "completed";

export interface CrmTask {
  id: string;
  title: string;
  kind: TaskKind;
  period: TaskPeriod;
  dueLabel: string;
  dueTime?: string;
  assignee: string;
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealNumber?: number;
  dealTitle?: string;
  result?: string;
  completedAt?: string;
}
