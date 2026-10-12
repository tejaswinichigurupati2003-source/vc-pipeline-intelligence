/**
 * Presentation vocabulary. The database keeps the original machine/spec strings (e.g. "REACH OUT: cite the recent
 * sector signal"); everything the user reads goes through here so naming stays consistent across the product.
 */

export type Tone = "go" | "caution" | "info" | "muted" | "alert";

export const TONE_CLASS: Record<Tone, { chip: string; dot: string; bar: string }> = {
  go: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", bar: "bg-emerald-500" },
  caution: { chip: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500", bar: "bg-amber-500" },
  info: { chip: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500", bar: "bg-indigo-500" },
  muted: { chip: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400", bar: "bg-slate-300" },
  alert: { chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500", bar: "bg-rose-500" },
};

export const STAGES = [
  { key: "yet_to_reach_out", title: "To contact", hint: "Not contacted yet", tone: "info" as Tone },
  { key: "waiting_for_response", title: "Awaiting reply", hint: "You've reached out", tone: "caution" as Tone },
  { key: "in_conversation", title: "In conversation", hint: "Active discussions", tone: "go" as Tone },
  { key: "closed", title: "Closed", hint: "Passed or done", tone: "muted" as Tone },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

export const STAGE_TITLE: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.title]));

export interface ActionView { label: string; hint: string; tone: Tone }

const ACTION_MAP: [RegExp, ActionView][] = [
  [/^REACH OUT/i, { label: "Reach out", hint: "Cite the recent sector signal", tone: "go" }],
  [/^REVIEW TIMING/i, { label: "Check timing", hint: "Fresh signal, but respect your contact cadence", tone: "caution" }],
  [/^REVIEW/i, { label: "Review fit", hint: "Check thesis and stage fit before reaching out", tone: "caution" }],
  [/^HOLD/i, { label: "Hold", hint: "Waiting on a reply; avoid a duplicate follow-up", tone: "muted" }],
  [/^USE IN CONVERSATION/i, { label: "Use in conversation", hint: "Fresh signal worth referencing", tone: "info" }],
  [/^SKIP/i, { label: "Skip this week", hint: "No verified public trigger in the last 30 days", tone: "muted" }],
  [/^CLOSED/i, { label: "Closed", hint: "Marked closed in your pipeline", tone: "muted" }],
];

/** Stored action text + scan health -> chip label, hint and tone. A failed scan is never presented as "quiet". */
export function formatAction(action: string | null, bucket?: string): ActionView {
  if (bucket === "stale") return { label: "Needs refresh", hint: "The last scan failed, so this is not the same as quiet", tone: "alert" };
  if (!action) return { label: "Not scanned", hint: "Run a refresh to check for signals", tone: "muted" };
  for (const [re, v] of ACTION_MAP) if (re.test(action)) return v;
  const [head, ...rest] = action.split(":");
  const cap = (s: string) => s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase();
  return { label: cap(head), hint: cap(rest.join(":")), tone: "muted" };
}

export function signalStrength(score: number | null): { label: string; tone: Tone; band: "hot" | "warm" | "quiet" | "none" } {
  if (score === null || score === undefined) return { label: "No data", tone: "muted", band: "none" };
  if (score >= 70) return { label: "Hot", tone: "go", band: "hot" };
  if (score >= 40) return { label: "Warm", tone: "caution", band: "warm" };
  return { label: "Quiet", tone: "muted", band: "quiet" };
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
}

/** Stable pastel hue per name so each firm has a recognisable avatar. */
export function avatarStyle(name: string): { background: string; color: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { background: `hsl(${h} 70% 93%)`, color: `hsl(${h} 55% 32%)` };
}

export function timeAgo(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "never";
  const s = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86_400);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
