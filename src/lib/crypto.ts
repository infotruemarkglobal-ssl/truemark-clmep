import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

// AES-256-GCM, reversible — for the one secret in this app that must be
// recoverable in plaintext (an org's OIDC client_secret, sent to their IdP
// on every token exchange). Every other secret in this codebase either
// never needs to be read back (User.passwordHash — bcrypt) or is a random
// high-entropy token that only needs an equality check (ApiKey.hashedKey —
// SHA-256). This is the first place actual reversible encryption-at-rest is
// needed, hence the new helper rather than reusing an existing pattern.
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error("ENCRYPTION_KEY not configured");
  // Accepts a key of any length/format and derives a proper 32-byte AES key —
  // avoids a confusing runtime error if the env var isn't exactly 32 bytes.
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted secret");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
