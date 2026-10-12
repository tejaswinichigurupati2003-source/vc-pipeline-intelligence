import pLimit from "p-limit";
import { config } from "@/lib/config";
import { applyPipelineSignalUpdate } from "@/lib/db/pipeline-writer";
import { insertCandidates, insertSignals, loadSignals, type CandidateLog } from "@/lib/db/store";
import { buildQueries } from "@/lib/discovery/query-builder";
import { dedupeAndRank, investorIsFirmName, prefilter } from "@/lib/discovery/normalize";
import { attributePerson, extractPeople, type FoundPerson } from "@/lib/people/extract";
import { addPeople } from "@/lib/people/store";
import { needsBackfill, recordScoreHistory } from "@/lib/signals/history";
import { fetchPage } from "@/lib/discovery/fetch-page";
import { langSearch } from "@/lib/providers/langsearch";
import { googleNews } from "@/lib/providers/google-news-rss";
import { monitorFeeds } from "@/lib/providers/feed-monitor";
import { classifyCandidates, LlmUnavailable } from "@/lib/verification/classify";
import type { PromptCandidate } from "@/lib/verification/prompt";
import { validateClassification, validateRulesOnly, type ValidationResult } from "@/lib/verification/validate";
import { scoreSignals } from "@/lib/scoring/score";
import { buildSignalSummary, latestSignalDate, recommendAction } from "@/lib/scoring/recommend";
import type { AcceptedSignal, Candidate, EvidenceBasis, FetchedPage, VcProfile } from "@/lib/types";

export interface RunContext {
  runId: string;
  startedAt: Date;
  /** LLM calls already used in this run (from DB) + mutated locally. */
  llmCallsUsed: () => number;
  addLlmCalls: (n: number) => void;
  isDegraded: () => boolean;
  markDegraded: () => void;
}

export interface VcScanResult {
  status: "success" | "no_verified_signal" | "failed" | "partial";
  scanMode: "llm" | "rules_only";
  queries: number;
  candidates: number;
  accepted: number;
  llmCalls: number;
  errorCode?: string;
  errorMessage?: string;
}

type RawCand = Omit<Candidate, "id">;

/** Full per-VC pipeline. A failed/partial-without-evidence scan NEVER calls the RPC: old values stay. */
export async function scanVc(vc: VcProfile, ctx: RunContext): Promise<VcScanResult> {
  const now = new Date();
  const t0 = Date.now();
  const phase = (name: string) => { if (process.env.SCAN_DEBUG) console.log(`[scan] ${vc.firm_name}: ${name} at +${((Date.now() - t0) / 1000).toFixed(1)}s`); };
  const logs: CandidateLog[] = [];
  const [existing, backfill] = await Promise.all([loadSignals(vc.id), needsBackfill(vc.id, now)]);
  const knownEventKeys = new Set(existing.map((s) => s.event_key));
  const knownCanonical = new Set(existing.map((s) => s.canonical_url));

  // ---- Discovery ---------------------------------------------------------------------------
  const planned = buildQueries(vc, { backfill });
  const raw: RawCand[] = [];
  const errors: string[] = [];
  let queries = 0;
  let succeeded = 0;

  const shortlistSize = () => dedupeAndRank(raw, vc, 99).filter((c) => prefilter(c, vc, now, knownCanonical, config.historyDays).keep).length;

  const runQuery = async (q: (typeof planned)[number]) => {
    queries++;
    try {
      raw.push(...(q.provider === "langsearch" ? await langSearch(q.query, 10, q.freshness ?? "oneMonth") : await googleNews(q.query)));
      succeeded++;
    } catch (e) {
      errors.push(`${q.id}: ${(e as Error).message}`);
    }
  };
  // Independent searches and the feed check run together; the extra people-focused query only runs if still needed.
  const [, feed] = await Promise.all([Promise.all(planned.filter((q) => q.id !== "Q3").map(runQuery)), monitorFeeds(vc.id)]);
  const q3 = planned.find((q) => q.id === "Q3");
  raw.push(...feed.items);
  if (q3 && shortlistSize() < 3) await runQuery(q3); // spec 7.3: skip if the first queries already gave enough
  errors.push(...feed.errors);

  phase(`discovery done (${raw.length} raw results)`);
  if (queries > 0 && succeeded === 0 && feed.items.length === 0) {
    return {
      status: "failed", scanMode: "llm", queries, candidates: 0, accepted: 0, llmCalls: 0,
      errorCode: "search_error", errorMessage: errors.join("; ").slice(0, 500),
    };
  }

  // ---- Normalise + prefilter ---------------------------------------------------------------
  const kept: RawCand[] = [];
  for (const c of dedupeAndRank(raw, vc, 999)) {
    const pf = prefilter(c, vc, now, knownCanonical, config.historyDays);
    if (pf.keep) kept.push(c);
    else logs.push(log(c, "rejected_prefilter", pf.reason ?? null));
  }
  const shortlist: Candidate[] = dedupeAndRank(kept, vc, config.maxCandidatesPerVc + (backfill ? 4 : 0)).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  for (const c of kept) if (!shortlist.some((s) => s.canonicalUrl === c.canonicalUrl)) logs.push(log(c, "rejected_prefilter", "over per-VC candidate cap"));

  // ---- Fetch pages -------------------------------------------------------------------------
  const pages = new Map<string, { page: FetchedPage | null; basis: EvidenceBasis; text: string }>();
  const fetchOne = async (c: Candidate) => {
    const headline = `${c.title}. ${c.snippet}`.trim();
    const redirectOnly = c.sourceDomain === "news.google.com" || c.url.includes("news.google.com/rss/articles");
    const canFallback = c.provider === "google_news_rss" || c.isFeedItem;
    if (redirectOnly) {
      pages.set(c.id, { page: null, basis: "headline_only", text: headline });
      return;
    }
    try {
      const page = await fetchPage(c.url);
      pages.set(c.id, { page, basis: "full_page", text: page.text || headline });
    } catch (e) {
      if (canFallback) pages.set(c.id, { page: null, basis: "headline_only", text: headline });
      else {
        pages.set(c.id, { page: null, basis: "headline_only", text: "" });
        logs.push(log(c, "fetch_failed", (e as Error).message));
      }
    }
  };
  const pageLimit = pLimit(3);
  await Promise.all(shortlist.map((c) => pageLimit(() => fetchOne(c))));
  phase(`pages fetched (${shortlist.length} candidates)`);
  const usable = shortlist.filter((c) => pages.get(c.id)!.text !== "");

  // ---- Classify (one Gemini call) or rules-only --------------------------------------------
  const accepted: AcceptedSignal[] = [];
  const vctx = (c: Candidate) => ({ vc, candidate: c, runStartedAt: ctx.startedAt, knownEventKeys, windowDays: config.historyDays });
  // People tied to this investor: the founder's row, anyone already known, and anyone named with a role in this scan's evidence.
  const known: { name: string; role: string | null }[] = [...(investorIsFirmName(vc) ? [] : [{ name: vc.investor_name, role: null }]), ...(vc.people ?? [])];
  const foundPeople = new Map<string, { person: FoundPerson; url: string }>();
  const record = (c: Candidate, r: ValidationResult) => {
    logs.push(log(c, r.outcome, r.reason));
    if (r.outcome === "accepted" && r.signal && !accepted.some((a) => a.event_key === r.signal!.event_key)) {
      const text = pages.get(c.id)?.text ?? "";
      for (const p of extractPeople(text, vc.firm_name, vc.aliases)) if (!foundPeople.has(p.name)) { foundPeople.set(p.name, { person: p, url: c.url }); known.push({ name: p.name, role: p.role }); }
      const who = attributePerson(`${r.signal.title} ${r.signal.evidence_summary} ${r.signal.evidence_quote ?? ""}`, known);
      accepted.push(who ? { ...r.signal, person_name: who.name, person_role: who.role } : r.signal);
      knownEventKeys.add(r.signal.event_key);
    } else if (r.outcome === "accepted") {
      logs[logs.length - 1] = log(c, "duplicate", "same event as another candidate in this scan");
    }
  };

  let scanMode: "llm" | "rules_only" = "llm";
  let llmCalls = 0;
  let degradedReason: string | null = null;

  if (usable.length) {
    const canUseLlm = !ctx.isDegraded() && ctx.llmCallsUsed() < config.llmMaxCallsPerRun && !!process.env.GEMINI_API_KEY && !!process.env.GEMINI_MODEL;
    if (!canUseLlm) {
      scanMode = "rules_only";
      degradedReason = ctx.isDegraded() ? "llm_quota" : "llm_cap";
    } else {
      const prompt: PromptCandidate[] = usable.map((c) => {
        const p = pages.get(c.id)!;
        return {
          id: c.id, provider: c.provider, sourceDomain: c.sourceDomain, providerDate: c.providerDate, title: c.title, url: c.url,
          publishedMeta: p.page?.publishedAt ?? null, modifiedMeta: p.page?.modifiedAt ?? null, text: p.text,
        };
      });
      try {
        const out = await classifyCandidates(vc, prompt, ctx.startedAt);
        llmCalls = out.calls;
        ctx.addLlmCalls(out.calls);
        for (const c of usable) {
          const cls = out.results.find((r) => r.candidate_id === c.id);
          if (!cls) {
            logs.push(log(c, "needs_review", "model returned no result for this candidate"));
            continue;
          }
          const p = pages.get(c.id)!;
          record(c, validateClassification(cls, p.page, `${c.title}. ${c.snippet}`, p.basis, vctx(c)));
        }
      } catch (e) {
        if (!(e instanceof LlmUnavailable)) throw e;
        scanMode = "rules_only";
        degradedReason = e.reason === "quota" ? "llm_quota" : "llm_error";
        llmCalls = e.calls;
        ctx.addLlmCalls(e.calls);
        if (e.reason === "quota") ctx.markDegraded();
      }
    }
    if (scanMode === "rules_only") {
      for (const c of usable) record(c, validateRulesOnly(c, vctx(c)));
    }
  }

  phase(`classified ${JSON.stringify(logs.reduce((h: Record<string, number>, l) => ({ ...h, [l.outcome]: (h[l.outcome] ?? 0) + 1 }), {}))}`);
  // ---- Persist evidence, then score + write four columns ----------------------------------
  await insertSignals(vc.id, accepted);
  await insertCandidates(ctx.runId, vc.id, logs);

  const hadSearchErrors = errors.length > 0;
  const all = await loadSignals(vc.id);
  const score = scoreSignals(all, now);
  const inWindow = score.items.some((i) => i.counted);

  // A scan with failed queries that found nothing in window can't prove "quiet" -> partial, no write.
  if (hadSearchErrors && !inWindow) {
    return {
      status: "partial", scanMode, queries, candidates: shortlist.length, accepted: accepted.length, llmCalls,
      errorCode: "search_error", errorMessage: errors.join("; ").slice(0, 500),
    };
  }

  // People found in this scan's evidence, and the investor named on the founder's row, join the associated-people list.
  await addPeople(vc.id, [...foundPeople.values()].map((f) => f.person), "signal", null).catch(() => undefined);
  if (!investorIsFirmName(vc)) await addPeople(vc.id, [{ name: vc.investor_name, role: null }], "investor_row", null).catch(() => undefined);

  await applyPipelineSignalUpdate(vc.id, {
    last_signal_date: latestSignalDate(all),
    signal_summary: buildSignalSummary(all, score),
    follow_up_score: score.score,
    recommended_action: recommendAction(score.band, vc.contact_status, vc.last_contact_at, now),
  });

  await recordScoreHistory({ vcId: vc.id, runId: ctx.runId, score: score.score, counted: score.items.filter((i) => i.counted).length, signals: all, now, backfilled: backfill });

  return {
    status: inWindow ? "success" : "no_verified_signal",
    scanMode, queries, candidates: shortlist.length, accepted: accepted.length, llmCalls,
    errorCode: degradedReason ?? undefined,
    errorMessage: hadSearchErrors ? errors.join("; ").slice(0, 500) : undefined,
  };
}

function log(c: RawCand, outcome: CandidateLog["outcome"], reason: string | null): CandidateLog {
  return { url: c.url, canonical_url: c.canonicalUrl, title: c.title || null, provider: c.provider, outcome, reason };
}
