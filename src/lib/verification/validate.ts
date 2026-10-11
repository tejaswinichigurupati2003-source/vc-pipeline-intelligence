import { config } from "@/lib/config";
import { eventKey, rulesOnlyMatch } from "@/lib/discovery/normalize";
import type {
  AcceptedSignal, Candidate, CandidateOutcome, Confidence, EvidenceBasis, FetchedPage, SignalType, SourceTier, VcProfile,
} from "@/lib/types";
import type { Classification } from "./classify";

export interface ValidationResult {
  outcome: CandidateOutcome;
  reason: string;
  signal?: AcceptedSignal;
}

const DAY = 86_400_000;

export const normWs = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/** Quote must appear verbatim (whitespace/quote-style normalised, case-sensitive) in the evidence text. */
export function quoteInSource(quote: string | null | undefined, source: string): boolean {
  if (!quote) return false;
  const q = normWs(quote);
  return q.length >= 8 && normWs(source).includes(q);
}

/** YYYY-MM-DD or ISO -> Date (UTC). */
export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  return isNaN(d.getTime()) ? null : d;
}

export function cutoffFor(runStartedAt: Date): Date {
  return new Date(runStartedAt.getTime() - config.lookbackDays * DAY);
}

export function sourceTier(c: Candidate, vc: VcProfile): SourceTier {
  const fd = vc.firm_domain?.toLowerCase().replace(/^www\./, "");
  if (c.isFeedItem) return "primary";
  if (fd && (c.sourceDomain === fd || c.sourceDomain.endsWith("." + fd))) return "primary";
  return "secondary";
}

interface Ctx {
  vc: VcProfile;
  candidate: Candidate;
  runStartedAt: Date;
  knownEventKeys: Set<string>;
}

/** Date used for the 30-day test, by signal type (spec 9.3). */
function pickDate(
  type: SignalType,
  cls: { published_at?: string | null; event_at?: string | null },
  page: FetchedPage | null,
  providerDate: string | null,
): { date: Date | null; basis: string | null; published: Date | null; event: Date | null; conflict: boolean } {
  const pagePub = parseDate(page?.publishedAt);
  const clsPub = parseDate(cls.published_at);
  const provPub = parseDate(providerDate);
  const published = pagePub ?? clsPub ?? provPub;
  const publishedBasis = pagePub ? page?.dateBasis ?? "page_meta" : clsPub ? "page_text" : provPub ? "provider" : null;
  const conflict = !!(pagePub && clsPub && Math.abs(pagePub.getTime() - clsPub.getTime()) > 3 * DAY);
  const event = parseDate(page?.eventAt) ?? parseDate(cls.event_at);

  if (type === "event_appearance") {
    // A recent listing of an old event does not count: need an actual event date.
    return { date: event, basis: event ? "page_text" : null, published, event, conflict };
  }
  return { date: published, basis: publishedBasis, published, event, conflict };
}

/** Stage C: deterministic validation of one Gemini classification. Code decides, not the model. */
export function validateClassification(
  cls: Classification,
  page: FetchedPage | null,
  headlineText: string,
  basis: EvidenceBasis,
  ctx: Ctx,
): ValidationResult {
  const { candidate: c, vc } = ctx;
  if (!cls.entity_match) return { outcome: "rejected_wrong_entity", reason: cls.reasoning };
  if (cls.signal_type === "general_mention") return { outcome: "rejected_low_relevance", reason: "general mention, not a dated event" };

  const evidenceText = basis === "full_page" && page ? page.text : headlineText;
  if (!quoteInSource(cls.evidence_quote, evidenceText)) {
    return { outcome: "needs_review", reason: "evidence quote not found verbatim in source text" };
  }

  const { date, basis: dateBasis, published, event, conflict } = pickDate(cls.signal_type, cls, page, c.providerDate);
  if (conflict) return { outcome: "needs_review", reason: "conflicting dates between page metadata and text" };
  if (!date) return { outcome: "needs_review", reason: cls.signal_type === "event_appearance" ? "no event date found" : "no usable date" };

  const cutoff = cutoffFor(ctx.runStartedAt);
  if (date < cutoff) return { outcome: "rejected_stale", reason: `dated ${date.toISOString().slice(0, 10)}, before ${cutoff.toISOString().slice(0, 10)}` };
  if (date.getTime() > ctx.runStartedAt.getTime() + 2 * DAY && cls.signal_type !== "event_appearance") {
    return { outcome: "needs_review", reason: "date is in the future" };
  }

  if (cls.relevance_score < 0.5 || cls.confidence === "low") {
    return { outcome: "rejected_low_relevance", reason: `relevance ${cls.relevance_score}, confidence ${cls.confidence}` };
  }

  const confidence: Confidence = basis === "headline_only" && cls.confidence === "high" ? "medium" : cls.confidence;
  const key = eventKey({ vc, signalType: cls.signal_type, keyText: c.title, date });
  if (ctx.knownEventKeys.has(key)) return { outcome: "duplicate", reason: "same event already recorded" };

  return {
    outcome: "accepted",
    reason: "passed all checks",
    signal: {
      title: c.title,
      source_url: c.url,
      canonical_url: page?.canonicalUrl ?? c.canonicalUrl,
      source_domain: c.sourceDomain,
      source_tier: sourceTier(c, vc),
      evidence_basis: basis,
      signal_type: cls.signal_type,
      published_at: published?.toISOString() ?? null,
      event_at: event?.toISOString() ?? null,
      date_basis: dateBasis,
      evidence_summary: cls.evidence_summary,
      evidence_quote: cls.evidence_quote ?? null,
      relevance_score: cls.relevance_score,
      confidence,
      event_key: key,
    },
  };
}

/** Degraded mode (spec 9.5): no LLM. Entity + action word + sector keyword in title/snippet, dated inside window. */
export function validateRulesOnly(c: Candidate, ctx: Ctx): ValidationResult {
  const { vc } = ctx;
  const m = rulesOnlyMatch(c, vc);
  if (!m.ok) return { outcome: "rejected_prefilter", reason: "rules-only: needs name + action word + sector keyword" };
  const date = parseDate(c.providerDate);
  if (!date) return { outcome: "needs_review", reason: "rules-only: no dated item" };
  if (date < cutoffFor(ctx.runStartedAt)) return { outcome: "rejected_stale", reason: "rules-only: outside window" };
  const key = eventKey({ vc, signalType: m.signalType, keyText: c.title, date });
  if (ctx.knownEventKeys.has(key)) return { outcome: "duplicate", reason: "same event already recorded" };
  return {
    outcome: "accepted",
    reason: "rules-only match",
    signal: {
      title: c.title,
      source_url: c.url,
      canonical_url: c.canonicalUrl,
      source_domain: c.sourceDomain,
      source_tier: sourceTier(c, vc),
      evidence_basis: "headline_only",
      signal_type: m.signalType,
      published_at: date.toISOString(),
      event_at: null,
      date_basis: "provider",
      evidence_summary: c.title.slice(0, 200),
      evidence_quote: c.title.slice(0, 200),
      relevance_score: 0.5,
      confidence: "medium",
      event_key: key,
    },
  };
}
