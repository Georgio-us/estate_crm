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
