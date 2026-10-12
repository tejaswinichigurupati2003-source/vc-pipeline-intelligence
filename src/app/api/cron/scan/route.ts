import { NextResponse } from "next/server";
import { isCron } from "@/lib/auth";
import { chainBatch, startRun } from "@/lib/scan/start";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await startRun("scheduled");
  if (!r.ok) return NextResponse.json({ skipped: r.reason, run_id: r.run.id });
  chainBatch(new URL(req.url).origin, r.run.id);
  return NextResponse.json({ started: true, run_id: r.run.id });
}
