import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { latestRun } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const run = await latestRun();
  if (!run) return NextResponse.json({ run: null });
  const { data: items } = await db()
    .from("signal_run_items").select("status, scan_mode, started_at, finished_at").eq("run_id", run.id);
  const finished = (items ?? []).filter((i) => i.status !== "running");
  const lastProgress = Math.max(new Date(run.started_at).getTime(), ...(items ?? []).map((i) => new Date(i.finished_at ?? i.started_at).getTime()));
  return NextResponse.json({
    run,
    refreshed: finished.filter((i) => i.status === "success" || i.status === "no_verified_signal").length,
    failed: finished.filter((i) => i.status === "failed" || i.status === "partial").length,
    processed: finished.length,
    llm_mode: (items ?? []).some((i) => i.scan_mode === "rules_only") ? "rules-only (partial)" : "gemini",
    stalled: run.status === "running" && Date.now() - lastProgress > 3 * 60_000,
  });
}
