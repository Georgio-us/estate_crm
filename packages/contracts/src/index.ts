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
