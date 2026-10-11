import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { followUpChecklist } from "@/lib/insights/brief";
import { loadBrief } from "@/lib/workspace/meeting";



export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out = await loadBrief((await params).id);
  return out ? NextResponse.json(out) : NextResponse.json({ error: "not found" }, { status: 404 });
}

/** POST: follow-up checklist. Only after the founder has confirmed their meeting notes. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const out = await loadBrief((await params).id);
  if (!out) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!out.meeting.notes_confirmed) return NextResponse.json({ error: "Confirm your meeting notes first" }, { status: 400 });
  return NextResponse.json({
    checklist: followUpChecklist({
      notes: out.meeting.notes ?? "",
      openCommitments: out.commitments.filter((c) => ["open", "proposed"].includes(c.status)).map((c) => c.text),
      diligence: out.diligence.filter((d) => d.status !== "provided").map((d) => d.request_text),
    }),
  });
}
