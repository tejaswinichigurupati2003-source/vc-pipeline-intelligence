import { db } from "./client";
import { config } from "@/lib/config";
import type { AcceptedSignal, CandidateOutcome, Provider, StoredSignal, VcProfile } from "@/lib/types";

const PROFILE_COLS =
  "id, investor_name, firm_name, firm_domain, investment_thesis, sector_keywords, aliases, contact_status, last_contact_at";

function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** Scanner-safe profile read: manual notes/history are never selected. */
export async function listProfiles(): Promise<VcProfile[]> {
  const rows = unwrap(await db().from("vc_pipeline").select(PROFILE_COLS), "listProfiles");
  return (rows as VcProfile[]).map((r) => ({ ...r, sector_keywords: r.sector_keywords ?? [], aliases: r.aliases ?? [] }));
}

export async function getProfile(id: string): Promise<VcProfile | null> {
  const { data } = await db().from("vc_pipeline").select(PROFILE_COLS).eq("id", id).maybeSingle();
  return data ? { ...(data as VcProfile), sector_keywords: data.sector_keywords ?? [], aliases: data.aliases ?? [] } : null;
}

export async function loadSignals(vcId: string): Promise<StoredSignal[]> {
  const rows = unwrap(await db().from("vc_signals").select("*").eq("vc_id", vcId), "loadSignals");
  return rows as StoredSignal[];
}

export async function insertSignals(vcId: string, signals: AcceptedSignal[]): Promise<number> {
  if (!signals.length) return 0;
  const rows = signals.map((s) => ({ ...s, vc_id: vcId, classifier_version: config.classifierVersion }));
  const { data, error } = await db()
    .from("vc_signals")
    .upsert(rows, { onConflict: "vc_id,event_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`insertSignals: ${error.message}`);
  return data?.length ?? 0;
}

export interface CandidateLog {
  url: string;
  canonical_url: string;
  title: string | null;
  provider: Provider;
  outcome: CandidateOutcome;
  reason: string | null;
}

export async function insertCandidates(runId: string, vcId: string, rows: CandidateLog[]) {
  if (!rows.length) return;
  const { error } = await db().from("signal_candidates").insert(rows.map((r) => ({ ...r, run_id: runId, vc_id: vcId })));
  if (error) throw new Error(`insertCandidates: ${error.message}`);
}

export interface RunRow {
  id: string;
  trigger_type: "scheduled" | "manual";
  status: "running" | "completed" | "partial" | "failed";
  started_at: string;
  finished_at: string | null;
  vcs_targeted: number;
  vcs_succeeded: number;
  vcs_failed: number;
  queries_executed: number;
  llm_calls: number;
  signals_accepted: number;
  error_summary: string | null;
}

export async function getRun(id: string): Promise<RunRow | null> {
  const { data } = await db().from("signal_runs").select("*").eq("id", id).maybeSingle();
  return (data as RunRow) ?? null;
}

export async function latestRun(): Promise<RunRow | null> {
  const { data } = await db().from("signal_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
  return (data as RunRow) ?? null;
}

/** No-overlap rule: a run that is `running` and younger than 30 minutes blocks a new one. */
export async function activeRun(): Promise<RunRow | null> {
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data } = await db()
    .from("signal_runs").select("*").eq("status", "running").gte("started_at", since)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  return (data as RunRow) ?? null;
}

export async function createRun(trigger: "scheduled" | "manual", targeted: number): Promise<RunRow> {
  const { data, error } = await db()
    .from("signal_runs")
    .insert({ trigger_type: trigger, status: "running", lookback_days: config.lookbackDays, vcs_targeted: targeted, app_version: config.appVersion })
    .select("*").single();
  if (error) throw new Error(`createRun: ${error.message}`);
  return data as RunRow;
}

export async function bumpCounters(
  runId: string,
  d: { succeeded?: number; failed?: number; queries?: number; llmCalls?: number; signals?: number },
) {
  const { error } = await db().rpc("bump_run_counters", {
    p_run_id: runId,
    p_succeeded: d.succeeded ?? 0,
    p_failed: d.failed ?? 0,
    p_queries: d.queries ?? 0,
    p_llm_calls: d.llmCalls ?? 0,
    p_signals: d.signals ?? 0,
  });
  if (error) throw new Error(`bumpCounters: ${error.message}`);
}

const STALE_ITEM_MS = 4 * 60_000;

/**
 * Claim up to `limit` VCs for this run. The unique (run_id, vc_id) constraint guarantees two concurrent
 * batches never take the same VC. Items stuck in `running` for >4 min (crashed batch) are re-taken.
 * Order: oldest last successful scan first.
 */
export async function claimVcs(runId: string, limit: number): Promise<VcProfile[]> {
  const profiles = await listProfiles();
  const items = unwrap(
    await db().from("signal_run_items").select("id, vc_id, status, started_at").eq("run_id", runId),
    "claimVcs/items",
  ) as { id: string; vc_id: string; status: string; started_at: string }[];
  const taken = new Map(items.map((i) => [i.vc_id, i]));

  const lastOk = new Map<string, string>();
  const hist = unwrap(
    await db().from("signal_run_items").select("vc_id, finished_at").in("status", ["success", "no_verified_signal"]).order("finished_at", { ascending: false }),
    "claimVcs/history",
  ) as { vc_id: string; finished_at: string | null }[];
  for (const h of hist) if (h.finished_at && !lastOk.has(h.vc_id)) lastOk.set(h.vc_id, h.finished_at);

  const order = [...profiles].sort((a, b) => (lastOk.get(a.id) ?? "").localeCompare(lastOk.get(b.id) ?? ""));
  const claimed: VcProfile[] = [];

  for (const vc of order) {
    if (claimed.length >= limit) break;
    const existing = taken.get(vc.id);
    if (existing) {
      const stale = existing.status === "running" && Date.now() - new Date(existing.started_at).getTime() > STALE_ITEM_MS;
      if (!stale) continue;
      const { data } = await db()
        .from("signal_run_items").update({ started_at: new Date().toISOString() })
        .eq("id", existing.id).eq("started_at", existing.started_at).eq("status", "running").select("id");
      if (data?.length) claimed.push(vc);
      continue;
    }
    const { error } = await db().from("signal_run_items").insert({ run_id: runId, vc_id: vc.id, status: "running" });
    if (!error) claimed.push(vc);
    else if (error.code !== "23505") throw new Error(`claimVcs/insert: ${error.message}`);
  }
  return claimed;
}

export async function finishItem(
  runId: string,
  vcId: string,
  f: {
    status: "success" | "no_verified_signal" | "failed" | "partial";
    scan_mode: "llm" | "rules_only";
    queries_executed: number;
    candidates_found: number;
    signals_accepted: number;
    error_code?: string | null;
    error_message?: string | null;
  },
) {
  const { error } = await db()
    .from("signal_run_items")
    .update({ ...f, error_code: f.error_code ?? null, error_message: f.error_message ?? null, finished_at: new Date().toISOString() })
    .eq("run_id", runId).eq("vc_id", vcId);
  if (error) throw new Error(`finishItem: ${error.message}`);
}

/** If every VC has a finished item, close the run. Safe to call repeatedly. */
export async function finalizeIfDone(runId: string): Promise<RunRow> {
  const run = (await getRun(runId))!;
  if (run.status !== "running") return run;
  const items = unwrap(await db().from("signal_run_items").select("status").eq("run_id", runId), "finalize") as { status: string }[];
  const total = await db().from("vc_pipeline").select("id", { count: "exact", head: true });
  if (items.length < (total.count ?? run.vcs_targeted) || items.some((i) => i.status === "running")) return run;
  const bad = items.filter((i) => i.status === "failed" || i.status === "partial").length;
  const status = bad === 0 ? "completed" : bad === items.length ? "failed" : "partial";
  const { data } = await db()
    .from("signal_runs")
    .update({ status, finished_at: new Date().toISOString(), error_summary: bad ? `${bad} of ${items.length} VCs not refreshed` : null })
    .eq("id", runId).eq("status", "running").select("*").maybeSingle();
  return (data as RunRow) ?? (await getRun(runId))!;
}

export async function remainingCount(runId: string): Promise<number> {
  const total = await db().from("vc_pipeline").select("id", { count: "exact", head: true });
  const done = await db().from("signal_run_items").select("id", { count: "exact", head: true }).eq("run_id", runId).neq("status", "running");
  return Math.max(0, (total.count ?? 0) - (done.count ?? 0));
}

export async function runIsDegraded(runId: string): Promise<boolean> {
  const { data } = await db().from("signal_run_items").select("id").eq("run_id", runId).eq("error_code", "llm_quota").limit(1);
  return !!data?.length;
}
