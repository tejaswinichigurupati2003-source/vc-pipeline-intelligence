import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/config";

const key = () => createHash("sha256").update(requireEnv("INTEGRATION_ENC_KEY")).digest();

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). Used for OAuth/API tokens at rest. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decrypt(blob: string): string {
  const b = Buffer.from(blob, "base64");
  const d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

/** Signed, expiring token for OAuth `state` (CSRF protection). */
export function signState(payload: string, ttlMs = 10 * 60_000): string {
  const body = `${payload}.${Date.now() + ttlMs}`;
  const sig = createHmac("sha256", key()).update(body).digest("hex");
  return Buffer.from(`${body}.${sig}`).toString("base64url");
}

export function verifyState(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString();
    const i = raw.lastIndexOf(".");
    const body = raw.slice(0, i), sig = raw.slice(i + 1);
    const want = createHmac("sha256", key()).update(body).digest("hex");
    if (sig.length !== want.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    const j = body.lastIndexOf(".");
    if (Number(body.slice(j + 1)) < Date.now()) return null;
    return body.slice(0, j);
  } catch {
    return null;
  }
}
