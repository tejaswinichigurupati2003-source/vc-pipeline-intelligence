import { describe, expect, it } from "vitest";
import { canonicalizeUrl, dedupeAndRank, eventKey, mentionsEntity, prefilter } from "@/lib/discovery/normalize";
import { buildQueries } from "@/lib/discovery/query-builder";
import { cand, daysAgo, NOW, vc } from "./helpers";

describe("canonicalizeUrl", () => {
  it("lowercases host, drops fragment and tracking params, sorts params", () => {
    expect(canonicalizeUrl("https://Example.com/a/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/a/?a=1&b=2");
  });
});

describe("mentionsEntity", () => {
  it("matches investor last name or firm, ignoring accents and punctuation", () => {
    expect(mentionsEntity("Interview with Jane Doe on freight", vc())).toBe(true);
    expect(mentionsEntity("Route Ventures closes fund", vc())).toBe(true);
    expect(mentionsEntity("Totally unrelated bakery", vc())).toBe(false);
  });
  it("handles parenthesised firm names", () => {
    const z = vc({ firm_name: "Z47 (Matrix Partners India)", investor_name: "Z47 (Matrix Partners India)" });
    expect(mentionsEntity("Matrix Partners India backs startup", z)).toBe(true);
    expect(mentionsEntity("Z47 raises new fund", z)).toBe(true);
  });
  it("firm-only rows do not match on a made-up last name", () => {
    const f = vc({ investor_name: "Blume Ventures", firm_name: "Blume Ventures" });
    expect(mentionsEntity("Ventures are booming", f)).toBe(false);
  });
});

describe("prefilter", () => {
  const known = new Set<string>();
  it("keeps a recent, named, unknown candidate", () => expect(prefilter(cand(), vc(), NOW, known).keep).toBe(true));
  it("drops blocked domains", () => expect(prefilter(cand({ sourceDomain: "linkedin.com" }), vc(), NOW, known).keep).toBe(false));
  it("drops candidates without a name", () => {
    expect(prefilter(cand({ title: "Freight market update", snippet: "", url: "https://a.example/x" }), vc(), NOW, known).keep).toBe(false);
  });
  it("drops items older than lookback + 3 days but allows undated ones", () => {
    expect(prefilter(cand({ providerDate: daysAgo(34).toISOString() }), vc(), NOW, known).keep).toBe(false);
    expect(prefilter(cand({ providerDate: daysAgo(33).toISOString() }), vc(), NOW, known).keep).toBe(true);
    expect(prefilter(cand({ providerDate: null }), vc(), NOW, known).keep).toBe(true);
  });
  it("drops already-stored URLs", () => {
    expect(prefilter(cand(), vc(), NOW, new Set([cand().canonicalUrl])).keep).toBe(false);
  });
});

describe("dedupeAndRank", () => {
  it("dedupes by canonical url, prefers primary/feed, caps", () => {
    const a = cand({ id: "a", canonicalUrl: "u1", providerDate: daysAgo(1).toISOString() });
    const b = cand({ id: "b", canonicalUrl: "u1", isFeedItem: true });
    const c = cand({ id: "c", canonicalUrl: "u2", providerDate: daysAgo(2).toISOString() });
    const out = dedupeAndRank([a, b, c], vc(), 6);
    expect(out).toHaveLength(2);
    expect(out[0].isFeedItem).toBe(true);
    expect(dedupeAndRank([a, c], vc(), 1)).toHaveLength(1);
  });
});

describe("eventKey", () => {
  it("is stable across syndicated copies within a week", () => {
    const k1 = eventKey({ vc: vc(), signalType: "portfolio_investment", keyText: "Route Ventures leads Series A in TruckLens", date: daysAgo(2) });
    const k2 = eventKey({ vc: vc(), signalType: "portfolio_investment", keyText: "route ventures leads series a in trucklens!", date: daysAgo(2) });
    expect(k1).toBe(k2);
  });
  it("differs for different events", () => {
    const a = eventKey({ vc: vc(), signalType: "portfolio_investment", keyText: "TruckLens", date: daysAgo(2) });
    const b = eventKey({ vc: vc(), signalType: "portfolio_investment", keyText: "FreightCo", date: daysAgo(2) });
    expect(a).not.toBe(b);
  });
});

describe("buildQueries", () => {
  it("builds partner queries when investor differs from firm, and caps at MAX_QUERIES_PER_VC", () => {
    const q = buildQueries(vc());
    expect(q.length).toBeLessThanOrEqual(4);
    expect(q[0].query).toContain('"Jane Doe"');
    expect(q.find((x) => x.provider === "google_news_rss")!.query).toContain("when:30d");
  });
  it("skips partner-only templates for firm-named rows and strips punctuation", () => {
    const q = buildQueries(vc({ investor_name: "Z47 (Matrix Partners India)", firm_name: "Z47 (Matrix Partners India)" }));
    expect(q.some((x) => x.id === "Q1" || x.id === "Q5")).toBe(false);
    expect(q.every((x) => !x.query.includes("(Matrix") || x.provider === "google_news_rss")).toBe(true);
  });
});

describe("firm-news query for firm-named rows", () => {
  it("adds one plain firm-news query on Google News, within the per-investor cap, and none for partner rows", () => {
    const firm = buildQueries(vc({ investor_name: "Blume Ventures", firm_name: "Blume Ventures" }));
    const q8 = firm.filter((x) => x.id === "Q8");
    expect(q8).toHaveLength(1);
    expect(q8[0].provider).toBe("google_news_rss");
    expect(q8[0].query).toContain('"Blume Ventures"');
    expect(q8[0].query).toContain("when:30d");
    expect(firm.length).toBeLessThanOrEqual(4);
    expect(buildQueries(vc()).some((x) => x.id === "Q8")).toBe(false);
  });
});
