import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getPipeline } from "@/lib/db/read";

export const dynamic = "force-dynamic";

/** Public read. contact_history / personal_notes only with a valid x-admin-token. */
export async function GET(req: Request) {
  return NextResponse.json({ rows: await getPipeline(isAdmin(req)) });
}
