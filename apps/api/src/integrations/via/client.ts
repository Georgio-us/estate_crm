import type { ApiConfig } from "../../config.js";

import { signViaRequest } from "./security.js";

export class ViaRemoteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function viaBaseUrl(config: ApiConfig): URL | null {
  const configured = config.viaApiBaseUrl?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    if (url.protocol === "https:") return url;
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return url;
  } catch { /* Invalid deployment configuration is reported as unavailable. */ }
  return null;
}

export class ViaRemoteClient {
  constructor(private readonly base: URL, private readonly connectionId: string, private readonly credential: string) {}

  async request<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    if (!path.startsWith("/api/integrations/estate/v1/") || path.startsWith("//")) throw new Error("Invalid Via integration path.");
    const url = new URL(path, this.base);
    if (url.origin !== this.base.origin) throw new Error("Invalid Via integration origin.");
    const rawBody = body === undefined ? "" : JSON.stringify(body);
    const timestamp = String(Date.now());
    const canonicalPath = `${url.pathname}${url.search}`;
    const response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        "x-integration-connection": this.connectionId,
        "x-integration-timestamp": timestamp,
        "x-integration-signature": signViaRequest(this.credential, timestamp, this.connectionId, method, canonicalPath, rawBody),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: rawBody }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const text = await response.text();
    if (text.length > 5_000_000) throw new ViaRemoteError(502, "Via вернул слишком большой ответ.");
    if (!response.ok) throw new ViaRemoteError(response.status, `Via не выполнил запрос (${response.status}).`);
    try { return JSON.parse(text) as T; }
    catch { throw new ViaRemoteError(502, "Via вернул некорректный ответ."); }
  }
}
