import { db } from "@/lib/db/client";
import { computeTrend } from "./timeseries";
import type { StoredSignal } from "@/lib/types";

export interface HistoryPoint { scored_at: string; score: number; counted_signals: number; momentum: string | null }

/** One row per successful scan per investor: the score over time. A failed scan never writes one. */
export async function recordScoreHistory(args: { vcId: string; runId: string; score: number; counted: number; signals: StoredSignal[]; now: Date; backfilled: boolean }) {
  const trend = computeTrend(args.signals, args.now);
  const { error } = await db().from("vc_score_history").upsert({
    vc_id: args.vcId, run_id: args.runId, scored_at: args.now.toISOString(), score: args.score, counted_signals: args.counted,
    signals_180d: trend.eventCount, momentum: trend.momentum, backfilled: args.backfilled,
  }, { onConflict: "run_id,vc_id" });
  if (error) console.error(`[scan] score history not saved: ${error.message}`); // history is secondary: never fail a scan over it
}

export async function loadHistory(vcId: string, limit = 40): Promise<HistoryPoint[]> {
  const { data } = await db().from("vc_score_history").select("scored_at, score, counted_signals, momentum").eq("vc_id", vcId).order("scored_at", { ascending: false }).limit(limit);
  return ((data ?? []) as HistoryPoint[]).reverse();
}

/** The older-history search runs about once a month per investor, not on every scan. */
export async function needsBackfill(vcId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const { data } = await db().from("vc_score_history").select("id").eq("vc_id", vcId).eq("backfilled", true).gte("scored_at", since).limit(1);
  return !(data && data.length);
}
