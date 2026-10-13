import type { SignalType, StoredSignal } from "@/lib/types";

const DAY = 86_400_000;

export const BASE_POINTS: Record<SignalType, number> = {
  investor_thesis: 30,
  portfolio_investment: 25,
  investor_commentary: 20,
  event_appearance: 15,
  fund_activity: 10,
  portfolio_activity: 8,
  other: 3,
};

export function signalDate(s: Pick<StoredSignal, "event_at" | "published_at">): Date | null {
  const d = s.event_at ?? s.published_at;
  return d ? new Date(d) : null;
}

export function recencyMultiplier(ageDays: number): number {
  if (ageDays < 0) return 1; // upcoming event
  if (ageDays <= 7) return 1;
  if (ageDays <= 14) return 0.8;
  if (ageDays <= 30) return 0.5;
  return 0;
}

export function sourceConfidenceMultiplier(s: Pick<StoredSignal, "source_tier" | "confidence">): number {
  if (s.confidence === "low") return 0;
  if (s.confidence === "medium") return 0.6;
  return s.source_tier === "primary" ? 1 : 0.85;
}

export interface ScoredSignal {
  signal: StoredSignal;
  ageDays: number;
  contribution: number;
  counted: boolean; // false when outside window, low confidence, or user-rejected
  note?: string;
}

export interface ScoreResult {
  score: number;
  band: "high" | "medium" | "low";
  items: ScoredSignal[];
}

export function bandOf(score: number): "high" | "medium" | "low" {
  // Same cut-offs as the Hot / Warm / Quiet labels, so "Hot" always comes with "Reach out".
  return score >= 30 ? "high" : score >= 1 ? "medium" : "low";
}

/** Pure, reproducible: score = min(100, round(sum(base * recency * relevance * sourceConfidence))). */
export function scoreSignals(signals: StoredSignal[], now: Date): ScoreResult {
  const items: ScoredSignal[] = [];
  const perType = new Map<SignalType, number>();

  // Newest first so full-weight slots go to the most recent events of each type.
  const sorted = [...signals].sort((a, b) => (signalDate(b)?.getTime() ?? 0) - (signalDate(a)?.getTime() ?? 0));
  const seenKeys = new Set<string>();

  for (const s of sorted) {
    const d = signalDate(s);
    const ageDays = d ? (now.getTime() - d.getTime()) / DAY : Infinity;
    if (s.verification_status !== "accepted") {
      items.push({ signal: s, ageDays, contribution: 0, counted: false, note: s.verification_status });
      continue;
    }
    if (seenKeys.has(s.event_key)) {
      items.push({ signal: s, ageDays, contribution: 0, counted: false, note: "duplicate event" });
      continue;
    }
    seenKeys.add(s.event_key);
    const rec = recencyMultiplier(ageDays);
    const src = sourceConfidenceMultiplier(s);
    if (rec === 0 || src === 0) {
      items.push({ signal: s, ageDays, contribution: 0, counted: false, note: rec === 0 ? "outside 30-day window" : "low confidence" });
      continue;
    }
    const n = perType.get(s.signal_type) ?? 0;
    perType.set(s.signal_type, n + 1);
    const capMult = n < 2 ? 1 : 0.5;
    const contribution = BASE_POINTS[s.signal_type] * rec * s.relevance_score * src * capMult;
    items.push({ signal: s, ageDays, contribution, counted: true, note: capMult < 1 ? "50% (3rd+ of this type)" : undefined });
  }

  const score = Math.min(100, Math.round(items.reduce((t, i) => t + i.contribution, 0)));
  return { score, band: bandOf(score), items };
}
