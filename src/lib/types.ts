export type ContactStatus =
  | "yet_to_reach_out"
  | "waiting_for_response"
  | "in_conversation"
  | "closed";

/** What the scanner needs from vc_pipeline. Manual notes/history are deliberately absent. */
export interface VcProfile {
  id: string;
  investor_name: string;
  firm_name: string;
  firm_domain: string | null;
  investment_thesis: string | null;
  sector_keywords: string[];
  aliases: string[];
  contact_status: ContactStatus;
  last_contact_at: string | null;
}

export type Provider = "langsearch" | "google_news_rss" | "feed";

export interface Candidate {
  id: string; // c1, c2... (per VC, per run)
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  provider: Provider;
  sourceDomain: string;
  /** Date reported by the provider/feed, ISO. Provider dates are not authoritative. */
  providerDate: string | null;
  isFeedItem: boolean;
}

export type SignalType =
  | "investor_thesis"
  | "portfolio_investment"
  | "investor_commentary"
  | "event_appearance"
  | "fund_activity"
  | "portfolio_activity"
  | "other";

export type Confidence = "high" | "medium" | "low";
export type SourceTier = "primary" | "secondary" | "unknown";
export type EvidenceBasis = "full_page" | "headline_only";

export type CandidateOutcome =
  | "accepted"
  | "rejected_prefilter"
  | "rejected_wrong_entity"
  | "rejected_stale"
  | "rejected_low_relevance"
  | "rejected_no_evidence"
  | "duplicate"
  | "needs_review"
  | "fetch_failed"
  | "llm_unavailable";

export interface FetchedPage {
  text: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  eventAt: string | null;
  canonicalUrl: string | null;
  dateBasis: "page_meta" | "page_text" | null;
}

/** A signal that passed validation and is ready to store/score. */
export interface AcceptedSignal {
  title: string;
  source_url: string;
  canonical_url: string;
  source_domain: string;
  source_tier: SourceTier;
  evidence_basis: EvidenceBasis;
  signal_type: SignalType;
  published_at: string | null;
  event_at: string | null;
  date_basis: string | null;
  evidence_summary: string;
  evidence_quote: string | null;
  relevance_score: number;
  confidence: Confidence;
  event_key: string;
}

/** A stored signal row as the scorer sees it. */
export interface StoredSignal extends AcceptedSignal {
  id: string;
  verification_status: "accepted" | "needs_review" | "superseded" | "rejected_by_user";
}
