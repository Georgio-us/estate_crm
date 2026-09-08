export type DealPriority = "low" | "medium" | "high";

export interface Deal {
  id: string;
  number: number;
  contactId?: string;
  title?: string;
  contactName: string;
  phone: string;
  relatedContacts?: Array<{ id: string; name: string; phone: string | null }>;
  request: string;
  budget?: string;
  operation?: "Покупка" | "Аренда" | "Продажа";
  propertyType?: string;
  district?: string;
  rooms?: string;
  comment?: string;
  createdAt?: string;
  source: "Meta" | "Website" | "Manual";
  assigneeId?: string;
  assignee: string;
  task?: string;
  taskId?: string;
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
  assigneeId?: string;
  assignee: string;
  dealIds: string[];
  relatedContacts: Array<{ id: string; name: string; phone: string | null; label: string | null }>;
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
  dueDate?: string;
  dueLabel: string;
  dueTime?: string;
  assigneeId?: string;
  assignee: string;
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealNumber?: number;
  dealTitle?: string;
  result?: string;
  completedAt?: string;
}

export type TeamRole = "Администратор" | "Руководитель" | "Менеджер";
export type TeamStatus = "Активен" | "Приглашён" | "Доступ отключён";

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone?: string;
  role: TeamRole;
  status: TeamStatus;
  lastActive: string;
  access: {
    deals: boolean;
    contacts: boolean;
    properties: boolean;
    tasks: boolean;
    team: boolean;
    settings: boolean;
  };
}
