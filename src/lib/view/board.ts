import type { PipelineRow } from "@/lib/db/read";
import { fitScore } from "@/lib/insights/fit";

/** Everything the board needs, JSON-serialisable (it crosses the server/client boundary). Never includes private notes. */
export interface BoardRow {
  id: string;
  firm: string;
  person: string | null;
  stage: string;
  score: number | null;
  action: string | null;
  bucket: string;
  summary: string | null;
  lastSignal: string | null;
  source: { url: string; domain: string; date: string | null } | null;
  rulesOnly: boolean;
  fit: number;
  relState: { state: string; confirmed: boolean } | null;
  lastContact: string | null;
  /** Verified sources in the last 30 days, activity direction, and the partner a source is about. */
  sources: number;
  momentum: string;
  via: string | null;
}

export function toBoardRows(rows: PipelineRow[], states: Record<string, { state: string; confirmed: boolean }> = {}): BoardRow[] {
  return rows.map((r) => ({
    id: r.id,
    firm: r.firm_name,
    person: r.investor_name !== r.firm_name ? r.investor_name : null,
    stage: r.contact_status,
    score: r.follow_up_score,
    action: r.recommended_action,
    bucket: r.bucket,
    summary: r.signal_summary,
    lastSignal: r.last_signal_date,
    source: r.top_signal ? { url: r.top_signal.source_url, domain: r.top_signal.source_domain, date: r.top_signal.date } : null,
    rulesOnly: r.latest_scan_mode === "rules_only",
    fit: fitScore({ investment_thesis: r.investment_thesis, sector_keywords: [], firm_name: r.firm_name }).score,
    relState: states[r.id] ?? null,
    lastContact: r.last_contact_at,
    sources: r.evidence?.sources30d ?? 0,
    momentum: r.evidence?.momentum ?? "none",
    via: r.top_signal?.person ?? null,
  }));
}

/** "[5 Oct] Led a round. Source: example.com. (+2 more)" -> { text, extra } so cards show clean prose. */
export function cleanSummary(s: string | null): { text: string; quiet: boolean; extra: number } {
  if (!s) return { text: "", quiet: true, extra: 0 };
  if (/^No verified public signal/i.test(s)) {
    const last = s.match(/Last known:\s*\[[^\]]+\]\s*(.+?)\.?$/i);
    return { text: last ? `Last seen: ${last[1]}` : "No public signal found yet", quiet: true, extra: 0 };
  }
  const extra = Number(s.match(/\(\+(\d+) more\)/)?.[1] ?? 0);
  const text = s.replace(/^\[[^\]]*\]\s*/, "").replace(/\s*Source:.*$/i, "").replace(/\s*\(\+\d+ more\)\s*$/, "").trim();
  return { text, quiet: false, extra };
}
