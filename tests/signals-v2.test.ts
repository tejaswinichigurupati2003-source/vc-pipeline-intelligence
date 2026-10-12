import { describe, expect, it } from "vitest";
import { buildQueries } from "@/lib/discovery/query-builder";
import { mentionsEntity, prefilter } from "@/lib/discovery/normalize";
import { explainSources, scoreHeadline } from "@/lib/insights/explain";
import { attributePerson, extractPeople } from "@/lib/people/extract";
import { scoreSignals } from "@/lib/scoring/score";
import { computeTrend } from "@/lib/signals/timeseries";
import { buildSystemInstruction } from "@/lib/verification/prompt";
import { validateClassification } from "@/lib/verification/validate";
import type { Classification } from "@/lib/verification/classify";
import { cand, daysAgo, NOW, sig, vc } from "./helpers";

const at = (n: number, over: Parameters<typeof sig>[0] = {}) => sig({ event_key: `k${n}`, id: `s${n}`, published_at: daysAgo(n).toISOString(), event_at: null, ...over });

describe("people extraction", () => {
  const FIRM = "Lightspeed India";
  it("finds a person named with a role at the firm, with the linking sentence as the quote", () => {
    const t = "Speaking at the event, Neeraj Arora, Managing Partner at Lightspeed India, said the fund will back logistics startups.";
    expect(extractPeople(t, FIRM)).toEqual([{ name: "Neeraj Arora", role: "Managing Partner", quote: expect.stringContaining("Neeraj Arora, Managing Partner at Lightspeed India") }]);
  });
  it("handles 'Firm partner Name' and 'Partner Name of Firm'", () => {
    expect(extractPeople("Lightspeed India Partners Hemant Mohapatra led the round.", FIRM).map((p) => p.name)).toContain("Hemant Mohapatra");
    expect(extractPeople("Partner Bejul Somaia of Lightspeed India joined the panel.", FIRM).map((p) => p.name)).toContain("Bejul Somaia");
  });
  it("does not invent people from a bare mention or from non-names", () => {
    expect(extractPeople("Lightspeed India invested in a freight startup.", FIRM)).toEqual([]);
    expect(extractPeople("Managing Partner at Lightspeed India said nothing.", FIRM)).toEqual([]);
    expect(extractPeople("The Venture Partner at Lightspeed India said yes.", FIRM)).toEqual([]);
  });
  it("every returned quote is verbatim in the source text", () => {
    const t = "Neeraj Arora, a partner with Lightspeed India, spoke. Partner Bejul Somaia of Lightspeed India agreed.";
    for (const p of extractPeople(t, FIRM)) expect(t).toContain(p.quote);
  });
  it("attributes a signal to a known person by full name only", () => {
    const people = [{ name: "Neeraj Arora", role: "Managing Partner" }];
    expect(attributePerson("Neeraj Arora says freight is next", people)?.name).toBe("Neeraj Arora");
    expect(attributePerson("Arora says freight is next", people)).toBeNull();
  });
});

describe("associated people in discovery", () => {
  it("adds a people query for up to two partners, and only searches a year back when asked", () => {
    const v = vc({ people: [{ name: "Jane Doe", role: null }, { name: "Neeraj Arora", role: "Partner" }, { name: "Bejul Somaia", role: "Partner" }, { name: "Third Person", role: null }] });
    const q = buildQueries(v);
    const q6 = q.find((x) => x.id === "Q6")!;
    expect(q6.provider).toBe("google_news_rss");
    expect(q6.query).toContain("Neeraj Arora");
    expect(q6.query).toContain("Bejul Somaia");
    expect(q6.query).not.toContain("Jane Doe");
    expect(q.some((x) => x.id === "Q7")).toBe(false);
    const withHistory = buildQueries(v, { backfill: true }).find((x) => x.id === "Q7")!;
    expect(withHistory.freshness).toBe("oneYear");
  });
  it("without people nothing extra is searched", () => {
    expect(buildQueries(vc()).map((x) => x.id)).not.toContain("Q6");
  });
  it("a partner's name is enough to be about the firm; a bare surname is not", () => {
    const v = vc({ people: [{ name: "Neeraj Arora", role: "Partner" }] });
    expect(mentionsEntity("Neeraj Arora on the future of freight", v)).toBe(true);
    expect(mentionsEntity("Arora on the future of freight", v)).toBe(false);
  });
  it("the prompt lists the associated people", () => {
    expect(buildSystemInstruction(vc({ people: [{ name: "Neeraj Arora", role: "Partner" }] }), NOW)).toContain("Neeraj Arora (Partner)");
    expect(buildSystemInstruction(vc(), NOW)).toContain("People associated with the firm: none known");
  });
});

describe("history window", () => {
  const cls = (days: number): Classification => ({
    candidate_id: "c1", reasoning: "ok", entity_match: true, signal_type: "portfolio_investment", published_at: daysAgo(days).toISOString().slice(0, 10), event_at: null,
    date_basis: "page_text", evidence_summary: "Route Ventures led a round.", evidence_quote: "Route Ventures led a round in freight", relevance_score: 0.9, confidence: "high", needs_human_review: false,
  });
  const page = (days: number) => ({ text: "Route Ventures led a round in freight startup X.", publishedAt: daysAgo(days).toISOString(), modifiedAt: null, eventAt: null, canonicalUrl: null, dateBasis: "page_meta" as const });
  const run = (days: number, windowDays?: number) => validateClassification(cls(days), page(days), "t", "full_page", { vc: vc(), candidate: cand(), runStartedAt: NOW, knownEventKeys: new Set(), windowDays });

  it("a 90-day-old event is stale by default but kept when the history window is wider", () => {
    expect(run(90).outcome).toBe("rejected_stale");
    expect(run(90, 180).outcome).toBe("accepted");
    expect(run(200, 180).outcome).toBe("rejected_stale");
  });
  it("older events never add to the score", () => {
    expect(scoreSignals([at(90)], NOW).score).toBe(0);
  });
  it("the prefilter honours a wider age limit", () => {
    const old = cand({ providerDate: daysAgo(90).toISOString() });
    expect(prefilter(old, vc(), NOW, new Set()).keep).toBe(false);
    expect(prefilter(old, vc(), NOW, new Set(), 180).keep).toBe(true);
  });
});

describe("time series", () => {
  it("no events -> none; first recent event -> new", () => {
    expect(computeTrend([], NOW).momentum).toBe("none");
    expect(computeTrend([at(5)], NOW).momentum).toBe("new");
  });
  it("more recent than usual -> rising; active before but not now -> cooling; similar -> steady", () => {
    const base = [at(45), at(75), at(105), at(135)];
    expect(computeTrend([...base, at(3), at(10), at(20)], NOW).momentum).toBe("rising");
    expect(computeTrend(base, NOW).momentum).toBe("cooling");
    expect(computeTrend([...base, at(12)], NOW).momentum).toBe("steady");
  });
  it("counts each event once and ignores events past 180 days", () => {
    const t = computeTrend([at(5), at(5, { id: "dup", event_key: "k5" }), at(200)], NOW);
    expect(t.eventCount).toBe(1);
    expect(t.weeks.reduce((n, w) => n + w.count, 0)).toBe(1);
    expect(t.weeks).toHaveLength(26);
  });
  it("reads a regular rhythm and flags when it has gone quiet against it", () => {
    const regular = [at(20), at(50), at(80), at(110)]; // about every 30 days
    expect(computeTrend(regular, NOW).cadenceDays).toBe(30);
    expect(computeTrend(regular, NOW).cadenceNote).toMatch(/in line/i);
    expect(computeTrend([at(70), at(100), at(130), at(160)], NOW).cadenceNote).toMatch(/quieter/i);
    expect(computeTrend([at(10), at(40)], NOW).cadenceDays).toBeNull();
  });
  it("is deterministic and never touches the score", () => {
    const s = [at(5), at(40)];
    const before = scoreSignals(s, NOW).score;
    computeTrend(s, NOW);
    expect(scoreSignals(s, NOW).score).toBe(before);
  });
});

describe("explanations", () => {
  it("the shown points add up to the score, and each has a formula and a source link", () => {
    const score = scoreSignals([at(2, { source_url: "https://a.example/x" }), at(9, { signal_type: "investor_commentary", source_tier: "secondary", relevance_score: 0.7 })], NOW);
    const ex = explainSources(score);
    const counted = ex.filter((e) => e.counted);
    expect(counted).toHaveLength(2);
    expect(Math.round(counted.reduce((t, e) => t + e.points, 0))).toBe(score.score);
    for (const e of counted) { expect(e.formula).toMatch(/base .* recency .* relevance .* source/); expect(e.url).toMatch(/^https:/); }
    expect(scoreHeadline(score)).toContain("2 verified sources");
  });
  it("says why an older or rejected item was not scored", () => {
    const ex = explainSources(scoreSignals([at(60), at(3, { id: "w", event_key: "w", verification_status: "rejected_by_user" })], NOW));
    expect(ex.find((e) => e.id === "s60")!.skipReason).toMatch(/Older than 30 days/);
    expect(ex.find((e) => e.id === "w")!.skipReason).toMatch(/marked this wrong/);
  });
  it("is honest about headline-only evidence and names the partner when known", () => {
    const [e] = explainSources(scoreSignals([at(2, { evidence_basis: "headline_only", person_name: "Neeraj Arora", person_role: "Partner" })], NOW));
    expect(e.checks.some((c) => !c.ok && /headline and snippet only/.test(c.text))).toBe(true);
    expect(e.person?.name).toBe("Neeraj Arora");
  });
});

describe("short firm names in headlines", () => {
  const lightspeed = vc({ investor_name: "Lightspeed India", firm_name: "Lightspeed India" });
  it("matches the distinctive part of the firm name when written as a name", () => {
    expect(mentionsEntity("Lightspeed raises $500 million for its new India and Southeast Asia fund", lightspeed)).toBe(true);
    expect(mentionsEntity("The speed of light is constant", lightspeed)).toBe(false);
    expect(mentionsEntity("lightspeed internet plans announced", lightspeed)).toBe(false);
  });
  it("does not shorten names with nothing distinctive to keep", () => {
    expect(mentionsEntity("Indian ventures are booming", vc({ investor_name: "India Ventures", firm_name: "India Ventures" }))).toBe(false);
  });
});
