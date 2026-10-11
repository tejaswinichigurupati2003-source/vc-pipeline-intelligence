import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, isCron } from "@/lib/auth";
import { runBatch } from "@/lib/scan/batch";
import { chainBatch } from "@/lib/scan/start";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!isCron(req) && !isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = z.object({ run_id: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "run_id required" }, { status: 400 });

  const out = await runBatch(body.data.run_id);
  // Self-continue while VCs remain. Claiming is idempotent, so a duplicate chain is harmless.
  if (!out.done && out.remaining > 0) chainBatch(new URL(req.url).origin, body.data.run_id);
  return NextResponse.json(out);
}
