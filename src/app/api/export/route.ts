import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { exportEvidence, exportPipeline } from "@/lib/export";

export const dynamic = "force-dynamic";

/** Admin only: the pipeline export includes private notes and contact history. */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const type = new URL(req.url).searchParams.get("type") === "evidence" ? "evidence" : "pipeline";
  const csv = type === "evidence" ? await exportEvidence() : await exportPipeline();
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vc-${type}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
