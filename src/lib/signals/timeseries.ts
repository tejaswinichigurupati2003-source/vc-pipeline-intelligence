import { BASE_POINTS, signalDate } from "@/lib/scoring/score";
import type { StoredSignal } from "@/lib/types";

/**
 * Time-series view of an investor's verified public activity. Pure and reproducible: the same signals give the same
 * answer. It describes the PAST (how active, how regular, speeding up or slowing down); it never changes follow_up_score.
 */
const DAY = 86_400_000;
export const HISTORY_DAYS = 180;

export type Momentum = "rising" | "steady" | "cooling" | "new" | "none";

export interface WeekBucket { start: string; count: number; points: number }
export interface Trend {
  momentum: Momentum;
  recentPoints: number;   // last 30 days
  baselinePoints: number; // average per 30 days over the 150 days before that
  weeks: WeekBucket[];    // oldest first, 26 weeks
  eventCount: number;     // distinct accepted events in the 180-day history
  cadenceDays: number | null;     // typical gap between events (median), when there are 3 or more
  daysSinceLast: number | null;
  cadenceNote: string | null;
  explanation: string;
}

/** Weight of one event, ignoring recency (recency is what the trend measures). */
export function eventWeight(s: Pick<StoredSignal, "signal_type" | "relevance_score" | "confidence">): number {
  const conf = s.confidence === "high" ? 1 : s.confidence === "medium" ? 0.6 : 0;
  return BASE_POINTS[s.signal_type] * s.relevance_score * conf;
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function computeTrend(signals: StoredSignal[], now: Date): Trend {
  const events = new Map<string, { t: number; w: number }>();
  for (const s of signals) {
    if (s.verification_status !== "accepted") continue;
    const d = signalDate(s);
    if (!d) continue;
    const age = (now.getTime() - d.getTime()) / DAY;
    if (age > HISTORY_DAYS || age < -30) continue;
    if (!events.has(s.event_key)) events.set(s.event_key, { t: d.getTime(), w: eventWeight(s) });
  }
  const list = [...events.values()].sort((a, b) => a.t - b.t);

  // 26 weekly buckets ending now
  const weeks: WeekBucket[] = Array.from({ length: 26 }, (_, i) => ({ start: new Date(now.getTime() - (26 - i) * 7 * DAY).toISOString().slice(0, 10), count: 0, points: 0 }));
  for (const e of list) {
    const ageWeeks = Math.floor((now.getTime() - e.t) / (7 * DAY));
    const idx = 25 - Math.max(0, ageWeeks);
    if (idx >= 0 && idx < 26) { weeks[idx].count++; weeks[idx].points = Math.round((weeks[idx].points + e.w) * 10) / 10; }
  }

  const recent = list.filter((e) => now.getTime() - e.t <= 30 * DAY).reduce((t, e) => t + e.w, 0);
  const prior = list.filter((e) => now.getTime() - e.t > 30 * DAY).reduce((t, e) => t + e.w, 0) / 5; // per 30 days over 150
  const recentPoints = Math.round(recent * 10) / 10, baselinePoints = Math.round(prior * 10) / 10;

  let momentum: Momentum;
  if (!list.length) momentum = "none";
  else if (recent > 0 && prior === 0) momentum = "new";
  else if (recent > 0 && recent >= prior * 1.5) momentum = "rising";
  else if (recent <= prior * 0.5) momentum = "cooling";
  else momentum = "steady";

  const gaps = list.slice(1).map((e, i) => (e.t - list[i].t) / DAY).filter((g) => g >= 1);
  const cadenceDays = list.length >= 3 && gaps.length ? Math.round(median(gaps)) : null;
  const last = list.length ? list[list.length - 1].t : null;
  const daysSinceLast = last === null ? null : Math.max(0, Math.round((now.getTime() - last) / DAY));
  let cadenceNote: string | null = null;
  if (cadenceDays !== null && daysSinceLast !== null) {
    cadenceNote = daysSinceLast > cadenceDays * 1.5 + 7
      ? `Usually active about every ${cadenceDays} days; it has been ${daysSinceLast}. Quieter than their pattern.`
      : `Usually active about every ${cadenceDays} days; the last was ${daysSinceLast} days ago. In line with their pattern.`;
  }

  const explanation =
    momentum === "none" ? "No verified public activity in the last 6 months."
    : momentum === "new" ? "New activity: nothing verified before the last 30 days, then a fresh signal."
    : momentum === "rising" ? `Speeding up: ${recentPoints} activity points in the last 30 days against a usual ${baselinePoints} per 30 days before that.`
    : momentum === "cooling" ? (recent === 0 ? "Cooling: active earlier in the last 6 months, nothing in the last 30 days." : `Cooling: ${recentPoints} points in the last 30 days against a usual ${baselinePoints}.`)
    : `Steady: ${recentPoints} points in the last 30 days, close to their usual ${baselinePoints}.`;

  return { momentum, recentPoints, baselinePoints, weeks, eventCount: list.length, cadenceDays, daysSinceLast, cadenceNote, explanation };
}

export const MOMENTUM_LABEL: Record<Momentum, string> = { rising: "Speeding up", steady: "Steady", cooling: "Cooling", new: "New activity", none: "No history" };
