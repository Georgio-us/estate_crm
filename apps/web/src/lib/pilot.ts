export const pilotPages = new Set(["/", "/home", "/contacts", "/objects", "/tasks", "/calendar", "/integrations", "/team", "/documentation", "/subscription", "/settings"]);

export function reportPilotEvent(kind: "page_view" | "browser_error", path: string, name?: "error" | "unhandled_rejection"): void {
  if (!pilotPages.has(path)) return;
  void fetch("/api/crm/pilot/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({ kind, path, ...(name ? { name } : {}) }),
  }).catch(() => { /* Diagnostics must never interrupt CRM work. */ });
}
