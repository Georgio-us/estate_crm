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
