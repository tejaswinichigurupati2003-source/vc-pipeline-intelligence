import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db/client";
import { saveCompanyContext, type CompanyContext } from "./context";

/**
 * Loads the fictional RouteFlow company (fixtures/routeflow) so the investor finder and drafts can be tried end to end.
 * Everything loaded is marked synthetic. The answer-key file (expected_facts.json) is NOT loaded: it stays outside the
 * company's own data so it can act as an evaluator.
 */
const DIR = path.join(process.cwd(), "fixtures", "routeflow");

interface Fixture {
  name: string; sector: string; product_summary: string; target_customer: string; geography: string[]; business_model: string; stage: string;
  fundraising_goal: { round: string; amount: number; currency: string };
}

export function parseDocHeader(md: string): { type: string; date: string | null; body: string } {
  const m = md.match(/^<!--([\s\S]*?)-->\s*/);
  const meta = m?.[1] ?? "";
  const type = meta.match(/document_type:\s*(\w+)/)?.[1] ?? "other";
  const date = meta.match(/document_date:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  return { type, date, body: md.slice(m ? m[0].length : 0).trim() };
}

const DOCS: [string, string][] = [
  ["website.md", "Website: about page"],
  ["pitch_deck.md", "Pitch deck (April 2026, older)"],
  ["metrics_report.md", "Metrics report (30 Sep 2026)"],
  ["investor_meeting_notes.md", "Investor meeting notes (6 Oct 2026)"],
];

export function sampleContext(): CompanyContext {
  const f = JSON.parse(readFileSync(path.join(DIR, "company.json"), "utf8")) as Fixture;
  return {
    name: f.name, sector: f.sector, productSummary: f.product_summary, targetCustomer: f.target_customer, geography: f.geography,
    businessModel: f.business_model, stage: f.stage, round: f.fundraising_goal.round, amount: f.fundraising_goal.amount, currency: f.fundraising_goal.currency, isSynthetic: true,
  };
}

/** Idempotent: loading twice never duplicates documents (unique on title). */
export async function loadSampleCompany(): Promise<{ documents: number }> {
  const ctx = sampleContext();
  await saveCompanyContext(ctx);
  const rows = DOCS.map(([file, title]) => {
    const { type, date, body } = parseDocHeader(readFileSync(path.join(DIR, file), "utf8"));
    return { company_id: "primary", document_type: type, title, content: body, document_date: date, is_synthetic: true };
  });
  const { error } = await db().from("company_documents").upsert(rows, { onConflict: "company_id,title" });
  if (error) throw new Error(error.message);
  // The drafts use these two settings.
  await db().from("app_settings").upsert([
    { key: "company_name", value: ctx.name, updated_at: new Date().toISOString() },
    { key: "company_one_liner", value: ctx.productSummary, updated_at: new Date().toISOString() },
  ], { onConflict: "key" });
  return { documents: rows.length };
}

/** Removes only what the sample loader created. The founder's own company data is never touched. */
export async function clearSampleCompany(): Promise<void> {
  await db().from("company_documents").delete().eq("is_synthetic", true);
  const { data } = await db().from("company_profile").select("is_synthetic").eq("id", "primary").maybeSingle();
  if (data?.is_synthetic) {
    await db().from("company_profile").delete().eq("id", "primary");
    await db().from("app_settings").delete().in("key", ["company_name", "company_one_liner"]);
  }
}
