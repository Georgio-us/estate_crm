export interface HealthResponse {
  status: "ok";
  service: "estate-crm-api";
  version: string;
  timestamp: string;
  database: "connected";
}

export interface HealthErrorResponse {
  status: "error";
  service: "estate-crm-api";
  timestamp: string;
  database: "unavailable";
}

export type MembershipRole = "ADMIN" | "LEAD" | "MANAGER";

export interface AuthenticatedOrganization {
  id: string;
  name: string;
  slug: string;
  role: MembershipRole;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  organization: AuthenticatedOrganization;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SessionResponse {
  user: AuthenticatedUser;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
}

export type ContactSource = "META" | "WEBSITE" | "MANUAL";

export interface ContactAssignee {
  id: string;
  name: string;
}

export interface ContactDealSummary {
  id: string;
  number: number;
  title: string;
  request: string;
  budget: string | null;
  stage: { id: string; title: string; color: string };
}

export interface ContactRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  source: ContactSource;
  assignee: ContactAssignee | null;
  dealIds: string[];
  deals: ContactDealSummary[];
  relatedContacts: Array<ContactAssignee & { phone: string | null; label: string | null }>;
  nextTask: { id: string; title: string; dueDate: string | null; dueTime: string | null } | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListResponse {
  contacts: ContactRecord[];
  total: number;
}

export interface CreateContactRequest {
  name: string;
  phone?: string;
  email?: string;
  telegram?: string;
  source?: ContactSource;
  assigneeId?: string | null;
  comment?: string;
}

export interface UpdateContactRequest {
  name?: string;
  phone?: string | null;
  email?: string | null;
  telegram?: string | null;
  source?: ContactSource;
  assigneeId?: string | null;
  comment?: string | null;
}

export interface LinkContactRequest {
  relatedContactId: string;
  label?: string;
}

export type DealOperation = "PURCHASE" | "RENT" | "SALE";

export interface PipelineDealRecord {
  id: string;
  number: number;
  contact: ContactAssignee & { phone: string | null };
  relatedContacts: Array<ContactAssignee & { phone: string | null }>;
  nextTask: { id: string; title: string; dueDate: string | null; dueTime: string | null } | null;
  title: string;
  request: string;
  budget: string | null;
  operation: DealOperation;
  propertyType: string | null;
  district: string | null;
  rooms: string | null;
  source: ContactSource;
  assignee: ContactAssignee | null;
  comment: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface LinkDealContactRequest {
  contactId: string;
}

export interface PipelineStageRecord {
  id: string;
  title: string;
  color: string;
  position: number;
  deals: PipelineDealRecord[];
}

export interface PipelineResponse {
  pipeline: {
    id: string;
    name: string;
    stages: PipelineStageRecord[];
  };
}

export interface CreateDealRequest {
  stageId: string;
  contactId?: string;
  contactName?: string;
  phone?: string;
  assigneeId?: string | null;
  title?: string;
  request?: string;
  budget?: string;
  operation?: DealOperation;
  propertyType?: string;
  district?: string;
  rooms?: string;
  source?: ContactSource;
  comment?: string;
}

export interface UpdateDealRequest {
  stageId?: string;
  assigneeId?: string | null;
  title?: string;
  request?: string;
  budget?: string | null;
  operation?: DealOperation;
  propertyType?: string | null;
  district?: string | null;
  rooms?: string | null;
  source?: ContactSource;
  comment?: string | null;
}

export interface MoveDealRequest {
  stageId: string;
  position?: number;
}

export type TaskKind = "CALL" | "MEETING" | "MESSAGE" | "OTHER";
export type TaskStatus = "ACTIVE" | "COMPLETED";

export interface TaskRecord {
  id: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  dueDate: string | null;
  dueTime: string | null;
  result: string | null;
  completedAt: string | null;
  contact: ContactAssignee | null;
  deal: { id: string; number: number; title: string } | null;
  assignee: ContactAssignee | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListResponse {
  tasks: TaskRecord[];
  total: number;
}

export interface CreateTaskRequest {
  title: string;
  kind?: TaskKind;
  dueDate?: string | null;
  dueTime?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  assigneeId?: string | null;
}

export interface UpdateTaskRequest extends CreateTaskRequest {
  status?: TaskStatus;
  result?: string | null;
}

export interface CompleteTaskRequest {
  result?: string;
}

export type PropertyCategory = "APARTMENT" | "HOUSE" | "LAND" | "COMMERCIAL";
export type PropertyMarket = "PRIMARY" | "SECONDARY";
export type PropertyOperation = "SALE" | "RENT";
export type PropertyStatus = "AVAILABLE" | "RESERVED" | "SOLD";
export type Currency = "USD" | "EUR";

export interface PropertyRecord {
  id: string;
  code: string;
  title: string;
  address: string | null;
  district: string | null;
  category: PropertyCategory;
  market: PropertyMarket;
  operation: PropertyOperation;
  status: PropertyStatus;
  price: number;
  currency: Currency;
  rooms: string | null;
  area: number;
  floor: number | null;
  totalFloors: number | null;
  landArea: number | null;
  project: string | null;
  developer: string | null;
  description: string | null;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyListResponse {
  properties: PropertyRecord[];
  total: number;
}

export interface CreatePropertyRequest {
  title: string;
  address?: string | null;
  district?: string | null;
  category: PropertyCategory;
  market: PropertyMarket;
  operation?: PropertyOperation;
  status?: PropertyStatus;
  price?: number;
  currency?: Currency;
  rooms?: string | null;
  area?: number;
  floor?: number | null;
  totalFloors?: number | null;
  landArea?: number | null;
  project?: string | null;
  developer?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export type UpdatePropertyRequest = Partial<CreatePropertyRequest>;

export interface DashboardResponse {
  deals: {
    total: number;
    unassigned: number;
    withoutTask: number;
  };
  contacts: { total: number };
  properties: { available: number };
  stages: Array<{ id: string; title: string; color: string; position: number; dealCount: number }>;
  activities: Array<ActivityEventRecord & {
    contactName: string | null;
    dealNumber: number | null;
    dealTitle: string | null;
  }>;
}

export type ActivityCategory = "NOTE" | "TASK" | "CHANGE" | "SOURCE" | "OBJECT";

export interface ActivityEventRecord {
  id: string;
  contactId: string | null;
  dealId: string | null;
  category: ActivityCategory;
  title: string;
  description: string | null;
  author: ContactAssignee | null;
  occurredAt: string;
}

export interface ActivityListResponse {
  activities: ActivityEventRecord[];
}

export interface CreateNoteRequest {
  text: string;
}
