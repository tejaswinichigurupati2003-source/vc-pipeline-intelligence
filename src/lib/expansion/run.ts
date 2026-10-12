import pLimit from "p-limit";
import { getCompanyContext, isUsableContext } from "@/lib/company/context";
import { db } from "@/lib/db/client";
import { listProfiles } from "@/lib/db/store";
import { fetchPage } from "@/lib/discovery/fetch-page";
import { canonicalizeUrl, domainOf, isBlockedDomain } from "@/lib/discovery/normalize";
import { googleNews } from "@/lib/providers/google-news-rss";
import { langSearch } from "@/lib/providers/langsearch";
import type { Candidate } from "@/lib/types";
import { buildExistingIndex } from "./dedupe";
import { extractInvestors, type ExtractionPage } from "./extract";
import { buildExpansionQueries } from "./queries";
import { type AcceptedSuggestion, type Evidence, mergeSuggestions, validateInvestor } from "./validate";

const MAX_PAGES = 18;
const MAX_HEADLINES = 6;
const PAGES_PER_CALL = 6;
const MAX_AGE_DAYS = 120;
const RUN_LOCK_MS = 6 * 60_000;

export interface ExpansionResult {
  ok: boolean;
  skipped?: "no_context" | "already_running";
  runId?: string;
  queries: number; pages: number; llmCalls: number; candidates: number; newCount: number; updatedCount: number;
  error?: string;
}

const empty = (): ExpansionResult => ({ ok: true, queries: 0, pages: 0, llmCalls: 0, candidates: 0, newCount: 0, updatedCount: 0 });

/** Find investors that fit the company and are not on the list yet. Writes only to investor_suggestions and expansion_runs. */
export async function runExpansion(trigger: "scheduled" | "manual", now = new Date()): Promise<ExpansionResult> {
  const ctx = await getCompanyContext();
  if (!isUsableContext(ctx)) return { ...empty(), ok: false, skipped: "no_context" };

  const since = new Date(now.getTime() - RUN_LOCK_MS).toISOString();
  const { data: active } = await db().from("expansion_runs").select("id").eq("status", "running").gte("started_at", since).limit(1);
  if (active?.length) return { ...empty(), ok: false, skipped: "already_running", runId: active[0].id };

  const { data: run, error: runErr } = await db().from("expansion_runs").insert({ trigger_type: trigger, status: "running" }).select("id").single();
  if (runErr || !run) throw new Error(`expansion run: ${runErr?.message}`);
  const out = empty();
  out.runId = run.id;

  try {
    const plan = buildExpansionQueries(ctx);
    out.queries = plan.length;
    const settled = await Promise.allSettled(
      plan.map((q) => (q.provider === "langsearch" ? langSearch(q.query, 10, q.freshness ?? "oneMonth") : googleNews(q.query))),
    );
    const raw: Omit<Candidate, "id">[] = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
    if (settled.every((s) => s.status === "rejected")) throw new Error("All searches failed");

    const byUrl = new Map<string, Omit<Candidate, "id">>();
    for (const c of raw) {
      if (isBlockedDomain(c.sourceDomain) || byUrl.has(c.canonicalUrl)) continue;
      const t = c.providerDate ? new Date(c.providerDate).getTime() : NaN;
      if (!isNaN(t) && (now.getTime() - t) / 86_400_000 > MAX_AGE_DAYS) continue;
      byUrl.set(c.canonicalUrl, c);
    }
    // News results are headline-only (their links are redirects), so they would crowd out readable pages if ranked by date alone.
    const newest = (list: Omit<Candidate, "id">[]) => [...list].sort((x, y) => (new Date(y.providerDate ?? 0).getTime() || 0) - (new Date(x.providerDate ?? 0).getTime() || 0));
    const all = [...byUrl.values()];
    const readable = newest(all.filter((c) => c.provider !== "google_news_rss")).slice(0, MAX_PAGES - MAX_HEADLINES);
    const cands = [...readable, ...newest(all.filter((c) => c.provider === "google_news_rss")).slice(0, MAX_PAGES - readable.length)];
    out.candidates = cands.length;

    const limit = pLimit(6);
    const pages: ExtractionPage[] = (await Promise.all(cands.map((c, i) => limit(async () => {
      let text = `${c.title}. ${c.snippet}`, date = c.providerDate;
      try {
        const p = await fetchPage(c.url);
        if (p.text.length > 200) text = p.text;
        date = p.publishedAt ?? p.eventAt ?? date;
      } catch { /* headline and snippet only */ }
      return { id: `p${i + 1}`, title: c.title, url: c.url, domain: c.sourceDomain || domainOf(c.url), date, text } satisfies ExtractionPage;
    })))).filter((p) => p.text.length > 40);
    out.pages = pages.length;

    const existing = buildExistingIndex(await listProfiles());
    const accepted: AcceptedSuggestion[] = [];
    const groups: ExtractionPage[][] = [];
    for (let i = 0; i < pages.length; i += PAGES_PER_CALL) groups.push(pages.slice(i, i + PAGES_PER_CALL));
    const calls = await Promise.allSettled(groups.map((g) => extractInvestors(ctx, g)));
    let failed = 0;
    calls.forEach((r, gi) => {
      if (r.status === "rejected") { failed++; out.llmCalls += (r.reason as { calls?: number })?.calls ?? 1; return; }
      out.llmCalls += r.value.calls;
      for (const res of r.value.results) {
        const page = groups[gi].find((p) => p.id === res.candidate_id);
        if (!page) continue;
        for (const inv of res.investors) {
          const v = validateInvestor(inv, page, ctx, existing, now);
          if (v.ok) accepted.push(v.suggestion);
        }
      }
    });
    if (groups.length && failed === groups.length) throw new Error("The model was unavailable; nothing was changed");

    const merged = mergeSuggestions(accepted);
    const { data: known } = await db().from("investor_suggestions").select("firm_key, status, evidence, times_seen, fit_score").in("firm_key", merged.map((m) => m.firmKey));
    const knownBy = new Map((known ?? []).map((k) => [k.firm_key as string, k]));
    for (const m of merged) {
      const prev = knownBy.get(m.firmKey);
      const nowIso = now.toISOString();
      if (!prev) {
        const { error } = await db().from("investor_suggestions").insert({
          firm_key: m.firmKey, firm_name: m.firmName, investor_type: m.investorType, thesis_summary: m.thesisSummary, why_fit: m.whyFit,
          fit_score: m.fitScore, stage_focus: m.stageFocus, geography: m.geography, evidence: m.evidenceAll, last_run_id: run.id,
          first_seen_at: nowIso, last_seen_at: nowIso,
        });
        if (!error) out.newCount++;
      } else {
        // Seen again: refresh evidence and score. A suggestion the founder dismissed or added keeps its decision.
        const old = (prev.evidence as Evidence[]) ?? [];
        const ev = [...m.evidenceAll, ...old.filter((o) => !m.evidenceAll.some((e) => canonicalizeUrl(e.url) === canonicalizeUrl(o.url)))].slice(0, 4);
        const { error } = await db().from("investor_suggestions").update({
          evidence: ev, times_seen: (prev.times_seen as number) + 1, last_seen_at: nowIso, last_run_id: run.id, fit_score: Math.max(prev.fit_score as number, m.fitScore),
        }).eq("firm_key", m.firmKey);
        if (!error && prev.status === "new") out.updatedCount++;
      }
    }
    await db().from("expansion_runs").update({
      status: "completed", finished_at: new Date().toISOString(), queries: out.queries, pages: out.pages, llm_calls: out.llmCalls,
      candidates: out.candidates, suggestions_new: out.newCount, suggestions_updated: out.updatedCount,
    }).eq("id", run.id);
    return out;
  } catch (e) {
    out.ok = false;
    out.error = (e as Error).message;
    await db().from("expansion_runs").update({
      status: "failed", finished_at: new Date().toISOString(), queries: out.queries, pages: out.pages, llm_calls: out.llmCalls, error: out.error.slice(0, 300),
    }).eq("id", run.id);
    return out;
  }
}
