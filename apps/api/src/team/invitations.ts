import { createHash, randomBytes } from "node:crypto";

export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
}
