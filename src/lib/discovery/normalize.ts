import { createHash } from "node:crypto";
import { ACTION_WORDS, BLOCKED_DOMAINS, config } from "@/lib/config";
import type { Candidate, SignalType, VcProfile } from "@/lib/types";

const TRACKING = /^(utm_|fbclid|gclid|mc_|ref$|ref_|igshid|cmpid|ocid|spm$)/i;

export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    let s = u.toString();
    if (s.endsWith("/") && u.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isBlockedDomain(domain: string): boolean {
  return BLOCKED_DOMAINS.some((b) => domain === b || domain.endsWith("." + b));
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Firm names like "Z47 (Matrix Partners India)" yield several name forms to match. */
export function firmNameForms(firm: string): string[] {
  const forms = new Set<string>();
  forms.add(normText(firm));
  const paren = firm.match(/\(([^)]+)\)/);
  if (paren) {
    forms.add(normText(paren[1]));
    forms.add(normText(firm.replace(/\([^)]*\)/, "")));
  }
  return [...forms].filter((f) => f.length >= 3);
}

/** Words that follow a firm's distinctive name ("Lightspeed India Partners" -> "Lightspeed"). */
const FIRM_SUFFIX = new Set(["ventures", "venture", "partners", "partner", "capital", "fund", "funds", "vc", "management", "advisors", "advisory", "investments", "investment", "india", "group", "llp", "ltd", "pvt", "inc", "labs", "holdings", "the", "global", "asia", "us"]);
export const FIRM_SUFFIXES = FIRM_SUFFIX;

/** The distinctive part of a firm name as written (original capitalisation), or null when nothing is left to shorten. */
export function firmCore(firm: string): string | null {
  const words = firm.replace(/\([^)]*\)/, " ").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}&.-]/gu, "")).filter(Boolean);
  const core = words.filter((w) => !FIRM_SUFFIX.has(w.toLowerCase()));
  if (!core.length || core.length === words.length) return null;
  const s = core.join(" ");
  return s.length >= 5 ? s : null;
}

export function investorIsFirmName(vc: Pick<VcProfile, "investor_name" | "firm_name">): boolean {
  return normText(vc.investor_name) === normText(vc.firm_name);
}

function lastName(name: string): string | null {
  const parts = normText(name).split(" ").filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

/** Does the text mention the investor (last name / alias) or the firm? */
export function mentionsEntity(text: string, vc: VcProfile): boolean {
  const t = " " + normText(text) + " ";
  const names: string[] = [...firmNameForms(vc.firm_name), ...vc.aliases.map(normText)];
  if (!investorIsFirmName(vc)) {
    names.push(normText(vc.investor_name)); // full name always counts
    const ln = lastName(vc.investor_name);
    if (ln && ln.length >= 4) names.push(ln); // bare last name only when distinctive enough
  }
  for (const p of vc.people ?? []) { const n = normText(p.name); if (n.split(" ").length >= 2) names.push(n); } // associated partners, full name only
  if (names.some((n) => n && t.includes(" " + n + " "))) return true;
  // Headlines say "Lightspeed", not "Lightspeed India Partners": match the distinctive part, capitalised as a name.
  const core = firmCore(vc.firm_name);
  const esc = core ? core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  return !!core && new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "u").test(text);
}

export interface PrefilterResult {
  keep: boolean;
  reason?: string;
}

type Raw = Omit<Candidate, "id">;

export function prefilter(c: Raw, vc: VcProfile, now: Date, knownCanonical: Set<string>, maxAgeDays: number = config.lookbackDays): PrefilterResult {
  if (isBlockedDomain(c.sourceDomain)) return { keep: false, reason: "blocked domain" };
  if (knownCanonical.has(c.canonicalUrl)) return { keep: false, reason: "already stored" };
  if (!mentionsEntity(`${c.title} ${c.snippet} ${c.url}`, vc)) {
    return { keep: false, reason: "no investor or firm name in title/snippet/url" };
  }
  if (c.providerDate) {
    const d = new Date(c.providerDate);
    if (!isNaN(d.getTime())) {
      const ageDays = (now.getTime() - d.getTime()) / 86_400_000;
      if (ageDays > maxAgeDays + 3) return { keep: false, reason: "older than lookback window" };
    }
  }
  return { keep: true };
}

/** Dedupe by canonical URL (feed items win), then cap: feed/primary first, then most recent. */
export function dedupeAndRank<T extends Raw>(cands: T[], vc: VcProfile, max: number): T[] {
  const byUrl = new Map<string, T>();
  for (const c of cands) {
    const prev = byUrl.get(c.canonicalUrl);
    if (!prev || (c.isFeedItem && !prev.isFeedItem)) byUrl.set(c.canonicalUrl, c);
  }
  const fd = vc.firm_domain?.toLowerCase().replace(/^www\./, "") ?? null;
  const rank = (c: Raw) => {
    const primary = c.isFeedItem || (fd && (c.sourceDomain === fd || c.sourceDomain.endsWith("." + fd)));
    const t = c.providerDate ? new Date(c.providerDate).getTime() : 0;
    // Items that name the investor in the headline first, then the firm's own site or feed, then the newest.
    return (mentionsEntity(c.title, vc) ? 2e15 : 0) + (primary ? 1e15 : 0) + (isNaN(t) ? 0 : t);
  };
  return [...byUrl.values()].sort((a, b) => rank(b) - rank(a)).slice(0, max);
}

/** Rule-only acceptance test (degraded mode, spec 9.5): name + action word + sector keyword in title/snippet. */
export function rulesOnlyMatch(c: Raw, vc: VcProfile): { ok: boolean; signalType: SignalType } {
  const text = ` ${normText(`${c.title} ${c.snippet}`)} `;
  const hasEntity = mentionsEntity(`${c.title} ${c.snippet}`, vc);
  const hasAction = ACTION_WORDS.some((w) => text.includes(` ${w} `));
  const hasSector = vc.sector_keywords.some((k) => text.includes(` ${normText(k)} `));
  const lower = text;
  let signalType: SignalType = "fund_activity";
  if (/ (invested|invests|investment|led|leads|backed|backs|backing|raises|raised|funding) /.test(lower)) {
    signalType = "portfolio_investment";
  } else if (/ (podcast|panel|keynote|speaker|speaks|webinar|appears) /.test(lower)) {
    signalType = "event_appearance";
  } else if (/ (interview) /.test(lower)) {
    signalType = "investor_commentary";
  }
  return { ok: hasEntity && hasAction && hasSector, signalType };
}

/** Hash of (firm/investor, type, key entity, date rounded to week) so syndicated copies collapse. */
export function eventKey(args: {
  vc: VcProfile;
  signalType: string;
  keyText: string;
  date: Date | null;
}): string {
  const week = args.date ? Math.floor(args.date.getTime() / (7 * 86_400_000)) : "nodate";
  const entity = normText(args.keyText).split(" ").filter((w) => w.length > 2).slice(0, 8).join(" ");
  const raw = [normText(args.vc.firm_name), normText(args.vc.investor_name), args.signalType, entity, week].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
