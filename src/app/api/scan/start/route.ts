import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { chainBatch, startRun } from "@/lib/scan/start";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await startRun("manual");
  if (!r.ok) return NextResponse.json({ error: "A scan is already running", run_id: r.run.id }, { status: 409 });
  chainBatch(new URL(req.url).origin, r.run.id);
  return NextResponse.json({ started: true, run_id: r.run.id });
}
