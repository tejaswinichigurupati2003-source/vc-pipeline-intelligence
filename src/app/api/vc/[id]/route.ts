import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { getVcDetail } from "@/lib/db/read";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getVcDetail(id, isAdmin(req));
  return d ? NextResponse.json(d) : NextResponse.json({ error: "not found" }, { status: 404 });
}

/** Mark a signal wrong (admin only). Excluded from scoring from the next run. Touches vc_signals only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = z.object({ signal_id: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "signal_id required" }, { status: 400 });
  const { error } = await db()
    .from("vc_signals").update({ verification_status: "rejected_by_user" }).eq("id", body.data.signal_id).eq("vc_id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
