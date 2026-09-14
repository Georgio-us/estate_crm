import type { ApiConfig } from "../config.js";

export function emailConfigured(config: ApiConfig): boolean {
  return Boolean(config.emailApiKey && config.emailFrom);
}

export async function sendTransactionalEmail(config: ApiConfig, input: {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<void> {
  if (!emailConfigured(config)) throw new Error("Email delivery is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.emailApiKey}`,
      "content-type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({ from: config.emailFrom, to: [input.to], subject: input.subject, text: input.text }),
    signal: AbortSignal.timeout(4_000),
  });
  if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
}
