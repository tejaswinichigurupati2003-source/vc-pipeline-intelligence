import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const h = req.headers.get("authorization") ?? "";
  return !!secret && safeEqual(h, `Bearer ${secret}`);
}

export function isAdmin(req: Request): boolean {
  const token = process.env.ADMIN_TOKEN;
  const h = req.headers.get("x-admin-token") ?? "";
  return !!token && !!h && safeEqual(h, token);
}
