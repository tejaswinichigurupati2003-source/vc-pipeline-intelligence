import { config } from "@/lib/config";
import type { ContactStatus } from "@/lib/types";
import { signalDate, type ScoreResult } from "./score";
import type { StoredSignal } from "@/lib/types";

export const ACTIONS = {
  REACH_OUT: "REACH OUT: cite the recent sector signal",
  REVIEW: "REVIEW: check thesis/stage fit before outreach",
  HOLD: "HOLD: already awaiting a reply; avoid duplicate follow-up",
  USE_IN_CONVERSATION: "USE IN CONVERSATION: fresh signal to reference",
  REVIEW_TIMING: "REVIEW TIMING: fresh signal, respect contact cadence",
  SKIP: "SKIP THIS WEEK: quiet, no verified public trigger in 30 days",
  CLOSED: "CLOSED",
} as const;

/** Relationship-aware action (spec 10.3). Only called for a SUCCESSFUL scan; failed scans never write. */
export function recommendAction(
  band: ScoreResult["band"],
  status: ContactStatus,
  lastContactAt: string | null,
  now: Date,
): string {
  if (status === "closed") return ACTIONS.CLOSED;
  if (status === "waiting_for_response") return ACTIONS.HOLD;
  if (status === "in_conversation") return band === "low" ? ACTIONS.SKIP : ACTIONS.USE_IN_CONVERSATION;
  if (band === "low") return ACTIONS.SKIP;
  const recentlyContacted =
    lastContactAt && (now.getTime() - new Date(lastContactAt).getTime()) / 86_400_000 <= config.cooldownDays;
  if (band === "high" && recentlyContacted) return ACTIONS.REVIEW_TIMING;
  return band === "high" ? ACTIONS.REACH_OUT : ACTIONS.REVIEW;
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** Code-templated summary (no LLM). Never implies the investor is interested in the founder's company. */
export function buildSignalSummary(signals: StoredSignal[], score: ScoreResult): string {
  const counted = score.items.filter((i) => i.counted).sort((a, b) => b.contribution - a.contribution);
  if (counted.length) {
    const top = counted[0].signal;
    const d = signalDate(top);
    const more = counted.length > 1 ? ` (+${counted.length - 1} more)` : "";
    return `[${d ? fmt(d) : "undated"}] ${top.evidence_summary} Source: ${top.source_domain}.${more}`;
  }
  const accepted = signals
    .filter((s) => s.verification_status === "accepted")
    .sort((a, b) => (signalDate(b)?.getTime() ?? 0) - (signalDate(a)?.getTime() ?? 0));
  if (accepted.length) {
    const d = signalDate(accepted[0]);
    return `No verified public signal in the last 30 days. Last known: [${d ? fmt(d) : "undated"}] ${accepted[0].title}.`;
  }
  return "No verified public signal in the last 30 days. No signal ever found.";
}

/** last_signal_date = latest accepted signal of ANY age. */
export function latestSignalDate(signals: StoredSignal[]): string | null {
  let best: Date | null = null;
  for (const s of signals) {
    if (s.verification_status !== "accepted") continue;
    const d = signalDate(s);
    if (d && (!best || d > best)) best = d;
  }
  return best ? best.toISOString() : null;
}
