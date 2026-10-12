import { BASE_POINTS, recencyMultiplier, signalDate, sourceConfidenceMultiplier, type ScoreResult } from "@/lib/scoring/score";

/**
 * Turns the score into something a founder can check line by line: where each point came from, the exact source,
 * what was verified about it, and what was left out and why. Pure: no scoring happens here, it only reads the result.
 */
export interface Check { ok: boolean; text: string }

export interface SourceExplain {
  id: string;
  title: string;
  url: string;
  domain: string;
  tier: "primary" | "secondary" | "unknown";
  typeLabel: string;
  date: string | null;
  ageDays: number | null;
  counted: boolean;
  points: number;
  /** "30 base × 1.0 recent × 0.9 relevant × 1.0 source = 27.0" */
  formula: string | null;
  skipReason: string | null;
  summary: string;
  quote: string | null;
  person: { name: string; role: string | null } | null;
  checks: Check[];
  status: string;
}

const TYPE_LABEL: Record<string, string> = {
  investor_thesis: "Thesis", portfolio_investment: "Investment", investor_commentary: "Commentary", event_appearance: "Appearance",
  fund_activity: "Fund news", portfolio_activity: "Portfolio news", other: "Other",
};

const DATE_BASIS: Record<string, string> = {
  page_meta: "Date read from the page's own publishing data",
  page_text: "Date written in the page text",
  relative_resolved: "Date worked out from a phrase like '3 days ago'",
  provider: "Date supplied by the search source (less certain)",
};

const n1 = (x: number) => (Math.round(x * 10) / 10).toString();

export function explainSources(score: ScoreResult): SourceExplain[] {
  return score.items.map((it) => {
    const s = it.signal;
    const d = signalDate(s);
    const age = Number.isFinite(it.ageDays) ? it.ageDays : null;

    const checks: Check[] = [];
    checks.push(s.evidence_basis === "full_page"
      ? { ok: true, text: "We read the full page" }
      : { ok: false, text: "Based on the headline and snippet only; the page itself could not be read" });
    checks.push(s.evidence_quote
      ? { ok: s.evidence_basis === "full_page", text: s.evidence_basis === "full_page" ? "The quote below was matched word for word against the page text" : "The quote was matched against the headline and snippet" }
      : { ok: false, text: "No exact quote available for this item" });
    checks.push(d
      ? { ok: s.date_basis !== "provider", text: DATE_BASIS[s.date_basis ?? ""] ?? "Dated" }
      : { ok: false, text: "No reliable date found" });
    checks.push(s.source_tier === "primary"
      ? { ok: true, text: "From the firm's own site or feed" }
      : { ok: true, text: `Independent publication (${s.source_domain})` });
    if (s.person_name) checks.push({ ok: true, text: `Names ${s.person_name}${s.person_role ? `, ${s.person_role}` : ""}, who is tied to this firm` });

    let formula: string | null = null;
    if (it.counted) {
      const base = BASE_POINTS[s.signal_type], rec = recencyMultiplier(it.ageDays), src = sourceConfidenceMultiplier(s);
      const cap = it.note?.startsWith("50%") ? 0.5 : 1;
      formula = `${base} base × ${n1(rec)} recency × ${n1(s.relevance_score)} relevance × ${n1(src)} source${cap < 1 ? " × 0.5 (3rd of this type)" : ""} = ${n1(it.contribution)}`;
    }

    return {
      id: s.id, title: s.title, url: s.source_url, domain: s.source_domain, tier: s.source_tier,
      typeLabel: TYPE_LABEL[s.signal_type] ?? s.signal_type, date: d ? d.toISOString() : null, ageDays: age,
      counted: it.counted, points: Math.round(it.contribution * 10) / 10, formula,
      skipReason: it.counted ? null : skipText(it.note, s.verification_status),
      summary: s.evidence_summary, quote: s.evidence_quote,
      person: s.person_name ? { name: s.person_name, role: s.person_role ?? null } : null,
      checks, status: s.verification_status,
    };
  });
}

function skipText(note: string | undefined, status: string): string {
  if (status === "rejected_by_user") return "You marked this wrong, so it is excluded";
  if (status === "needs_review") return "Needs your review before it can count";
  if (note === "outside 30-day window") return "Older than 30 days: kept for the trend, not scored";
  if (note === "duplicate event") return "Same event as another source, counted once";
  if (note === "low confidence") return "Low confidence, so not scored";
  return note ?? "Not scored";
}

/** One-line summary of what makes up the score. */
export function scoreHeadline(score: ScoreResult): string {
  const counted = score.items.filter((i) => i.counted);
  if (!counted.length) return "No verified source in the last 30 days, so the score is 0.";
  return `${score.score} points from ${counted.length} verified source${counted.length === 1 ? "" : "s"} in the last 30 days` + (score.items.reduce((t, i) => t + i.contribution, 0) > 100 ? " (capped at 100)." : ".");
}
