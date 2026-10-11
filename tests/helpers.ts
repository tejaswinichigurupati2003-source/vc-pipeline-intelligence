import type { Candidate, StoredSignal, VcProfile } from "@/lib/types";

export const NOW = new Date("2026-10-12T01:00:00Z");
export const daysAgo = (n: number, from = NOW) => new Date(from.getTime() - n * 86_400_000);

export const vc = (over: Partial<VcProfile> = {}): VcProfile => ({
  id: "vc1",
  investor_name: "Jane Doe",
  firm_name: "Route Ventures",
  firm_domain: "routeventures.example",
  investment_thesis: "Logistics and B2B SaaS, Seed",
  sector_keywords: ["logistics", "supply chain", "freight", "warehouse"],
  aliases: [],
  contact_status: "yet_to_reach_out",
  last_contact_at: null,
  ...over,
});

export const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: "c1",
  url: "https://news.example.com/a",
  canonicalUrl: "https://news.example.com/a",
  title: "Route Ventures leads $6M Series A in freight startup TruckLens",
  snippet: "Route Ventures, led by partner Jane Doe, has led a $6 million Series A in TruckLens.",
  provider: "langsearch",
  sourceDomain: "news.example.com",
  providerDate: daysAgo(3).toISOString(),
  isFeedItem: false,
  ...over,
});

export const sig = (over: Partial<StoredSignal> = {}): StoredSignal => ({
  id: "s1",
  title: "t",
  source_url: "https://x.example/a",
  canonical_url: "https://x.example/a",
  source_domain: "x.example",
  source_tier: "primary",
  evidence_basis: "full_page",
  signal_type: "portfolio_investment",
  published_at: daysAgo(1).toISOString(),
  event_at: null,
  date_basis: "page_meta",
  evidence_summary: "Route Ventures led a round.",
  evidence_quote: "led a round",
  relevance_score: 1,
  confidence: "high",
  event_key: "k1",
  verification_status: "accepted",
  ...over,
});
