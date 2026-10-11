import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminToken, SESSION_COOKIE, sessionValue } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = z.object({ token: z.string().min(1) }).safeParse(await req.json().catch(() => ({})));
  if (!body.success || !isAdminToken(body.data.token)) return NextResponse.json({ error: "Wrong admin token" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, sessionValue()!, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
