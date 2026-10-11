import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { parseCsv, toImportRows } from "@/lib/import-csv";

export const dynamic = "force-dynamic";

/** INSERT-ONLY CSV import. Existing rows (matched on lower(investor_name), lower(firm_name)) are never modified. */
export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  const { rows, skipped } = toImportRows(parseCsv(text));

  const { data: existing, error: e1 } = await db().from("vc_pipeline").select("investor_name, firm_name");
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const have = new Set((existing ?? []).map((r) => `${r.investor_name.toLowerCase()}|${r.firm_name.toLowerCase()}`));
  const fresh = rows.filter((r) => !have.has(`${r.investor_name.toLowerCase()}|${r.firm_name.toLowerCase()}`));

  if (fresh.length) {
    const { error } = await db().from("vc_pipeline").insert(fresh);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ inserted: fresh.length, already_present: rows.length - fresh.length, skipped });
}
