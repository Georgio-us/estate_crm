import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const signatureWindowMs = 5 * 60 * 1_000;

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function viaSignatureInput(timestamp: string, connectionId: string, method: string, path: string, body: string): string {
  return [timestamp, connectionId, method.toUpperCase(), path, hashBody(body)].join("\n");
}

export function signViaRequest(secret: string, timestamp: string, connectionId: string, method: string, path: string, body = ""): string {
  return createHmac("sha256", secret).update(viaSignatureInput(timestamp, connectionId, method, path, body)).digest("base64url");
}

export function verifyViaRequestSignature(input: {
  secret: string;
  timestamp: string;
  connectionId: string;
  method: string;
  path: string;
  body: string;
  signature: string;
  now?: number;
}): boolean {
  const timestamp = Number(input.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs((input.now ?? Date.now()) - timestamp) > signatureWindowMs) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.signature)) return false;
  const expected = Buffer.from(signViaRequest(input.secret, input.timestamp, input.connectionId, input.method, input.path, input.body), "base64url");
  const received = Buffer.from(input.signature, "base64url");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function readViaEncryptionKey(encoded: string | undefined): Buffer | null {
  if (!encoded) return null;
  const key = Buffer.from(encoded, "base64url");
  return key.length === 32 ? key : null;
}

export function encryptViaCredential(secret: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Via encryption key must be 32 bytes.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptViaCredential(encrypted: string, key: Buffer): string {
  if (key.length !== 32) throw new Error("Via encryption key must be 32 bytes.");
  const [version, ivText, tagText, ciphertextText, extra] = encrypted.split(".");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText || extra) throw new Error("Invalid Via credential format.");
  const iv = Buffer.from(ivText, "base64url");
  const tag = Buffer.from(tagText, "base64url");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid Via credential format.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
}
