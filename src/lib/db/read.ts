import { db } from "./client";
import { bucketFor, type Bucket } from "@/lib/view/buckets";
import { scoreSignals, type ScoreResult } from "@/lib/scoring/score";
import { computeTrend, type Momentum } from "@/lib/signals/timeseries";
import type { StoredSignal } from "@/lib/types";

export interface PipelineRow {
  id: string;
  investor_name: string;
  firm_name: string;
  firm_domain: string | null;
  investment_thesis: string | null;
  contact_status: string;
  last_contact_at: string | null;
  last_signal_date: string | null;
  signal_summary: string | null;
  follow_up_score: number | null;
  recommended_action: string | null;
  // admin-only (stripped for public views)
  contact_history?: string | null;
  personal_notes?: string | null;
  // derived
  latest_item_status: string | null;
  latest_item_error: string | null;
  latest_scan_mode: string | null;
  last_success_at: string | null;
  top_signal: { title: string; source_url: string; source_domain: string; date: string | null; person: string | null } | null;
  /** Verified sources in the last 30 days, and how activity is moving over the last 6 months. */
  evidence: { sources30d: number; momentum: Momentum };
  bucket: Bucket;
}

const PUBLIC_COLS =
  "id, investor_name, firm_name, firm_domain, investment_thesis, contact_status, last_contact_at, last_signal_date, signal_summary, follow_up_score, recommended_action";

/**
 * Dashboard rows. `includePrivate` adds contact_history/personal_notes: only pass true after the admin
 * token has been verified server-side. Public responses never carry them (spec 12.4).
 */
export async function getPipeline(includePrivate = false, onlyId?: string): Promise<PipelineRow[]> {
  const cols = includePrivate ? `${PUBLIC_COLS}, contact_history, personal_notes` : PUBLIC_COLS;
  // The three reads are independent: run them together (one round trip instead of three).
  const [{ data: vcs, error }, { data: items }, { data: sigs }] = await Promise.all([
    onlyId ? db().from("vc_pipeline").select(cols).eq("id", onlyId) : db().from("vc_pipeline").select(cols).order("follow_up_score", { ascending: false, nullsFirst: false }),
    // Latest scan result per investor is all that is needed; a few recent runs cover it. One investor needs far fewer rows.
    (onlyId ? db().from("signal_run_items").select("vc_id, status, scan_mode, error_message, finished_at, started_at").eq("vc_id", onlyId) : db().from("signal_run_items").select("vc_id, status, scan_mode, error_message, finished_at, started_at"))
      .neq("status", "running")
      .order("finished_at", { ascending: false })
      .limit(onlyId ? 40 : 600),
    (onlyId ? db().from("vc_signals").select("vc_id, title, source_url, source_domain, event_at, published_at, verification_status, signal_type, relevance_score, confidence, event_key, person_name").eq("vc_id", onlyId) : db().from("vc_signals").select("vc_id, title, source_url, source_domain, event_at, published_at, verification_status, signal_type, relevance_score, confidence, event_key, person_name"))
      .eq("verification_status", "accepted"),
  ]);
  if (error) throw new Error(error.message);
  const latest = new Map<string, { status: string; scan_mode: string; error_message: string | null }>();
  const lastOk = new Map<string, string>();
  for (const i of items ?? []) {
    if (!latest.has(i.vc_id)) latest.set(i.vc_id, i);
    if ((i.status === "success" || i.status === "no_verified_signal") && i.finished_at && !lastOk.has(i.vc_id)) lastOk.set(i.vc_id, i.finished_at);
  }

  const top = new Map<string, PipelineRow["top_signal"]>();
  const bestDate = new Map<string, number>();
  const byVc = new Map<string, StoredSignal[]>();
  const nowD = new Date();
  for (const s of sigs ?? []) {
    byVc.set(s.vc_id, [...(byVc.get(s.vc_id) ?? []), s as unknown as StoredSignal]);
    const d = s.event_at ?? s.published_at;
    const t = d ? new Date(d).getTime() : 0;
    if (t >= (bestDate.get(s.vc_id) ?? -1)) {
      bestDate.set(s.vc_id, t);
      top.set(s.vc_id, { title: s.title, source_url: s.source_url, source_domain: s.source_domain, date: d, person: s.person_name ?? null });
    }
  }

  return ((vcs ?? []) as unknown as Record<string, unknown>[]).map((v) => {
    const id = v.id as string;
    const l = latest.get(id);
    const row = {
      ...(v as object),
      latest_item_status: l?.status ?? null,
      latest_item_error: l?.error_message ?? null,
      latest_scan_mode: l?.scan_mode ?? null,
      last_success_at: lastOk.get(id) ?? null,
      top_signal: top.get(id) ?? null,
      evidence: evidenceOf(byVc.get(id) ?? [], nowD),
    } as Omit<PipelineRow, "bucket">;
    return { ...row, bucket: bucketFor(row) } as PipelineRow;
  });
}

function evidenceOf(sigs: StoredSignal[], now: Date): PipelineRow["evidence"] {
  const seen = new Set<string>();
  let sources30d = 0;
  for (const s of sigs) {
    const d = s.event_at ?? s.published_at;
    if (!d || seen.has(s.event_key)) continue;
    seen.add(s.event_key);
    if (s.confidence !== "low" && (now.getTime() - new Date(d).getTime()) / 86_400_000 <= 30) sources30d++;
  }
  return { sources30d, momentum: computeTrend(sigs, now).momentum };
}

export interface VcDetail {
  vc: PipelineRow;
  signals: StoredSignal[];
  score: ScoreResult;
  rejected: { url: string; title: string | null; provider: string; outcome: string; reason: string | null; created_at: string }[];
  runs: { run_id: string; status: string; scan_mode: string; signals_accepted: number; error_message: string | null; finished_at: string | null }[];
}

export async function getVcDetail(id: string, includePrivate = false): Promise<VcDetail | null> {
  const [rows, { data: signals }, { data: rejected }, { data: runs }] = await Promise.all([
    getPipeline(includePrivate, id),
    db().from("vc_signals").select("*").eq("vc_id", id),
    db().from("signal_candidates").select("url, title, provider, outcome, reason, created_at")
      .eq("vc_id", id).neq("outcome", "accepted").order("created_at", { ascending: false }).limit(40),
    db().from("signal_run_items").select("run_id, status, scan_mode, signals_accepted, error_message, finished_at")
      .eq("vc_id", id).order("started_at", { ascending: false }).limit(10),
  ]);
  const vc = rows.find((r) => r.id === id);
  if (!vc) return null;
  const st = (signals ?? []) as StoredSignal[];
  return { vc, signals: st, score: scoreSignals(st, new Date()), rejected: rejected ?? [], runs: runs ?? [] };
}
