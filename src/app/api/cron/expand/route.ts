import { NextResponse } from "next/server";
import { isCron } from "@/lib/auth";
import { runExpansion } from "@/lib/expansion/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Weekly: look for investors that fit the company and are not on the list. Suggestions only; nothing is added automatically. */
export async function GET(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runExpansion("scheduled");
  return NextResponse.json(r);
}
