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

export interface ContactRecord {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  telegram: string | null;
  source: ContactSource;
  assignee: ContactAssignee | null;
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
