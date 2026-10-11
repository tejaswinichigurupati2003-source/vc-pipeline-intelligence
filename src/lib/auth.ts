import { createHash, timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const SESSION_COOKIE = "vcpi_admin";

/** Cookie value: derived from ADMIN_TOKEN, so rotating the token invalidates every session. */
export function sessionValue(): string | null {
  const t = process.env.ADMIN_TOKEN;
  return t ? createHash("sha256").update(`vcpi-session:${t}`).digest("hex") : null;
}

export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const h = req.headers.get("authorization") ?? "";
  return !!secret && safeEqual(h, `Bearer ${secret}`);
}

export function isAdminToken(token: string | null | undefined): boolean {
  const t = process.env.ADMIN_TOKEN;
  return !!t && !!token && safeEqual(token, t);
}

function cookieOf(req: Request, name: string): string | null {
  const m = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

export function hasAdminSession(cookieValue: string | null | undefined): boolean {
  const v = sessionValue();
  return !!v && !!cookieValue && safeEqual(cookieValue, v);
}

/** Admin = valid x-admin-token header (scripts, dashboard Refresh) OR valid session cookie (workspace UI). */
export function isAdmin(req: Request): boolean {
  if (isAdminToken(req.headers.get("x-admin-token"))) return true;
  if (!hasAdminSession(cookieOf(req, SESSION_COOKIE))) return false;
  // Cookie auth is ambient, so require a same-origin caller for state-changing requests (CSRF defence in depth).
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) return false;
  }
  return true;
}
