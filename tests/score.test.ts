import { describe, expect, it } from "vitest";
import { bandOf, recencyMultiplier, scoreSignals } from "@/lib/scoring/score";
import { ACTIONS, buildSignalSummary, hasStrongSignal, latestSignalDate, recommendAction } from "@/lib/scoring/recommend";
import { daysAgo, NOW, sig } from "./helpers";

describe("recency window boundaries", () => {
  it.each([[0, 1], [7, 1], [8, 0.8], [14, 0.8], [15, 0.5], [30, 0.5], [31, 0]])("day %s -> x%s", (d, m) => {
    expect(recencyMultiplier(d)).toBe(m);
  });
  it("scores a day-30 signal at half weight and a day-31 signal at zero", () => {
    expect(scoreSignals([sig({ published_at: daysAgo(30).toISOString() })], NOW).score).toBe(13); // 25*0.5=12.5 -> 13
    expect(scoreSignals([sig({ published_at: daysAgo(31).toISOString() })], NOW).score).toBe(0);
  });
});

describe("scoring math", () => {
  it("applies base * recency * relevance * source confidence", () => {
    const s = sig({ signal_type: "investor_thesis", relevance_score: 0.8, source_tier: "secondary", published_at: daysAgo(10).toISOString() });
    // 30 * 0.8 * 0.8 * 0.85 = 16.32
    expect(scoreSignals([s], NOW).score).toBe(16);
  });
  it("medium confidence uses 0.6 and low is not scored", () => {
    expect(scoreSignals([sig({ confidence: "medium" })], NOW).score).toBe(15);
    expect(scoreSignals([sig({ confidence: "low" })], NOW).score).toBe(0);
  });
  it("counts syndicated copies (same event_key) once", () => {
    const r = scoreSignals([sig({ id: "a", event_key: "same" }), sig({ id: "b", event_key: "same" })], NOW);
    expect(r.score).toBe(25);
  });
  it("halves the third event of one type", () => {
    const three = [1, 2, 3].map((i) => sig({ id: `s${i}`, event_key: `k${i}`, signal_type: "event_appearance" }));
    expect(scoreSignals(three, NOW).score).toBe(Math.round(15 + 15 + 7.5));
  });
  it("ignores user-rejected signals and caps at 100", () => {
    expect(scoreSignals([sig({ verification_status: "rejected_by_user" })], NOW).score).toBe(0);
    const many = ["investor_thesis", "portfolio_investment", "investor_commentary", "event_appearance"].flatMap((t) =>
      [1, 2].map((i) => sig({ id: `${t}${i}`, event_key: `${t}${i}`, signal_type: t as never })));
    expect(scoreSignals(many, NOW).score).toBeLessThanOrEqual(100);
  });
  it("bands", () => {
    expect([bandOf(70), bandOf(30), bandOf(29), bandOf(1), bandOf(0)]).toEqual(["high", "high", "medium", "medium", "low"]);
  });
});

describe("recommended action", () => {
  it("waiting_for_response always HOLD (when scan succeeded)", () => {
    for (const b of ["high", "medium", "low"] as const) expect(recommendAction(b, "waiting_for_response", null, NOW)).toBe(ACTIONS.HOLD);
  });
  it("quiet -> SKIP, high -> REACH OUT, medium -> REVIEW", () => {
    expect(recommendAction("low", "yet_to_reach_out", null, NOW)).toBe(ACTIONS.SKIP);
    expect(recommendAction("high", "yet_to_reach_out", null, NOW)).toBe(ACTIONS.REACH_OUT);
    expect(recommendAction("medium", "yet_to_reach_out", null, NOW)).toBe(ACTIONS.REVIEW);
  });
  it("in_conversation uses the signal; closed is CLOSED; recent contact -> REVIEW TIMING", () => {
    expect(recommendAction("high", "in_conversation", null, NOW)).toBe(ACTIONS.USE_IN_CONVERSATION);
    expect(recommendAction("high", "closed", null, NOW)).toBe(ACTIONS.CLOSED);
    expect(recommendAction("high", "yet_to_reach_out", daysAgo(5).toISOString(), NOW)).toBe(ACTIONS.REVIEW_TIMING);
  });
});

describe("summary and last_signal_date", () => {
  it("quiet VC shows last known signal and keeps its date", () => {
    const old = sig({ published_at: daysAgo(100).toISOString(), title: "Old news" });
    const score = scoreSignals([old], NOW);
    expect(buildSignalSummary([old], score)).toContain("No verified public signal in the last 30 days. Last known:");
    expect(latestSignalDate([old])).toBe(daysAgo(100).toISOString());
  });
  it("no signals ever", () => {
    expect(buildSignalSummary([], scoreSignals([], NOW))).toContain("No signal ever found.");
    expect(latestSignalDate([])).toBeNull();
  });
  it("active VC summary cites the source and counts extras", () => {
    const a = sig({ id: "a", event_key: "a" }), b = sig({ id: "b", event_key: "b", signal_type: "event_appearance" });
    const s = buildSignalSummary([a, b], scoreSignals([a, b], NOW));
    expect(s).toContain("Source: x.example.");
    expect(s).toContain("(+1 more)");
  });
});

describe("one strong recent signal is enough to be ready to reach out", () => {
  const at = (days: number, over: Partial<Parameters<typeof sig>[0]> = {}) =>
    sig({ id: `s${days}`, event_key: `k${days}${over.signal_type ?? ""}`, published_at: daysAgo(days).toISOString(), event_at: null, source_tier: "secondary", confidence: "high", relevance_score: 0.8, signal_type: "investor_thesis", ...over });
  const strong = (s: ReturnType<typeof sig>[]) => hasStrongSignal(scoreSignals(s, NOW));

  it("a single thesis statement from 8 days ago in a news source qualifies, though its score is only medium", () => {
    const r = scoreSignals([at(8)], NOW);
    expect(r.band).toBe("medium");
    expect(hasStrongSignal(r)).toBe(true);
    expect(recommendAction(r.band, "yet_to_reach_out", null, NOW, hasStrongSignal(r))).toBe(ACTIONS.REACH_OUT);
  });
  it("older than 14 days, low relevance, or portfolio news do not qualify", () => {
    expect(strong([at(15)])).toBe(false);
    expect(strong([at(5, { relevance_score: 0.69 })])).toBe(false);
    expect(strong([at(5, { signal_type: "portfolio_activity" })])).toBe(false);
    expect(strong([at(5, { signal_type: "fund_activity" })])).toBe(false);
  });
  it("low confidence, rejected or duplicate evidence does not qualify", () => {
    expect(strong([at(5, { confidence: "low" })])).toBe(false);
    expect(strong([at(5, { verification_status: "rejected_by_user" })])).toBe(false);
  });
  it("the relationship rules still win: waiting, in conversation, closed, and the contact cool-down", () => {
    expect(recommendAction("medium", "waiting_for_response", null, NOW, true)).toBe(ACTIONS.HOLD);
    expect(recommendAction("medium", "in_conversation", null, NOW, true)).toBe(ACTIONS.USE_IN_CONVERSATION);
    expect(recommendAction("medium", "closed", null, NOW, true)).toBe(ACTIONS.CLOSED);
    expect(recommendAction("medium", "yet_to_reach_out", daysAgo(5).toISOString(), NOW, true)).toBe(ACTIONS.REVIEW_TIMING);
  });
  it("no evidence still means skip, and without a strong signal a medium score is still review", () => {
    expect(recommendAction("low", "yet_to_reach_out", null, NOW, false)).toBe(ACTIONS.SKIP);
    expect(recommendAction("medium", "yet_to_reach_out", null, NOW, false)).toBe(ACTIONS.REVIEW);
  });
  it("never changes the score", () => {
    const s = [at(8)];
    const before = scoreSignals(s, NOW).score;
    hasStrongSignal(scoreSignals(s, NOW));
    expect(scoreSignals(s, NOW).score).toBe(before);
  });
});
