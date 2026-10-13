import type { PipelineRow } from "@/lib/db/read";
import { cleanSummary } from "@/lib/view/board";

/** One rotating line: "[15] investors are awaiting your reply". `value` is the number that counts up. */
export interface LiveLine { before: string; value: number | null; after: string; href: string }

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Lines for the live strip on Today. Each one is a plain fact from the pipeline, with a link to see it. */
export function buildLiveLines(rows: PipelineRow[], suggestions: number): LiveLine[] {
  const out: LiveLine[] = [];
  const live = rows.filter((r) => r.bucket !== "stale");
  const withNews = live.filter((r) => (r.evidence?.sources30d ?? 0) > 0).length;
  if (withNews) out.push({ before: "", value: withNews, after: `${plural(withNews, "investor has", "investors have")} verified news in the last 30 days`, href: "/investors?filter=warm" });

  const top = [...live].sort((a, b) => (b.follow_up_score ?? 0) - (a.follow_up_score ?? 0))[0];
  if (top && (top.follow_up_score ?? 0) > 0) out.push({ before: `${top.firm_name} is your strongest signal at`, value: top.follow_up_score, after: "out of 100", href: `/investors/${top.id}#why` });

  const rising = live.filter((r) => r.evidence?.momentum === "rising" || r.evidence?.momentum === "new");
  if (rising.length) out.push({ before: "", value: rising.length, after: `${plural(rising.length, "investor is", "investors are")} showing new or rising activity: ${rising.slice(0, 2).map((r) => r.firm_name).join(", ")}${rising.length > 2 ? " and more" : ""}`, href: `/investors/${rising[0].id}#why` });

  const waiting = rows.filter((r) => r.contact_status === "waiting_for_response").length;
  if (waiting) out.push({ before: "", value: waiting, after: `${plural(waiting, "investor is", "investors are")} waiting on you or your reply`, href: "/investors?stage=waiting_for_response" });

  const quiet = live.filter((r) => (r.follow_up_score ?? 0) < 1).length;
  if (quiet) out.push({ before: "", value: quiet, after: `${plural(quiet, "investor is", "investors are")} quiet: no verified news yet`, href: "/investors?filter=quiet" });

  if (suggestions) out.push({ before: "", value: suggestions, after: `new ${plural(suggestions, "investor suggestion is", "investor suggestions are")} waiting in Discover`, href: "/discover" });
  return out;
}

export interface TickerItem { firm: string; text: string; date: string | null; href: string; id: string }

/** The most recent verified headlines across the pipeline, newest first, for the scrolling strip. */
export function buildTicker(rows: PipelineRow[], max = 12): TickerItem[] {
  return rows
    .filter((r) => r.top_signal && r.bucket !== "stale")
    .sort((a, b) => new Date(b.top_signal!.date ?? 0).getTime() - new Date(a.top_signal!.date ?? 0).getTime())
    .slice(0, max)
    .map((r) => {
      const t = cleanSummary(r.signal_summary);
      const text = (t.quiet ? r.top_signal!.title : t.text || r.top_signal!.title).replace(/\s+/g, " ").trim();
      return { id: r.id, firm: r.firm_name, text: text.length > 90 ? `${text.slice(0, 88).trimEnd()}…` : text, date: r.top_signal!.date, href: `/investors/${r.id}#why` };
    });
}
