export type Bucket = "reach_out" | "review" | "hold" | "quiet" | "stale" | "closed" | "unscanned";

export const BUCKET_ORDER: Bucket[] = ["reach_out", "review", "hold", "quiet", "stale", "unscanned", "closed"];

export const BUCKET_META: Record<Bucket, { title: string; blurb: string }> = {
  reach_out: { title: "Ready to reach out", blurb: "Not contacted yet, with a strong and fresh verified signal." },
  review: { title: "Worth a look", blurb: "A moderate signal, a timing check, or a live conversation with something new to mention." },
  hold: { title: "On hold", blurb: "You're already waiting on a reply, so avoid a duplicate follow-up." },
  quiet: { title: "Quiet this week", blurb: "No qualifying signal found by our searches. That is not proof the investor is inactive." },
  stale: { title: "Needs a refresh", blurb: "The last scan failed. Showing the last good values; this is not the same as quiet." },
  unscanned: { title: "Not scanned yet", blurb: "No successful scan on record." },
  closed: { title: "Closed", blurb: "Marked closed in your pipeline." },
};
/** Failed or partial latest scan overrides everything: stale is never presented as quiet. */
export function bucketFor(row: {
  recommended_action: string | null;
  contact_status: string;
  latest_item_status: string | null;
}): Bucket {
  if (row.contact_status === "closed") return "closed";
  if (row.latest_item_status === "failed" || row.latest_item_status === "partial") return "stale";
  const a = row.recommended_action;
  if (!a) return "unscanned";
  if (a.startsWith("REACH OUT")) return "reach_out";
  if (a.startsWith("REVIEW") || a.startsWith("USE IN CONVERSATION")) return "review";
  if (a.startsWith("HOLD")) return "hold";
  if (a.startsWith("SKIP")) return "quiet";
  if (a.startsWith("CLOSED")) return "closed";
  return "unscanned";
}

export function bandOfScore(score: number | null): "high" | "medium" | "low" | "none" {
  if (score === null) return "none";
  return score >= 30 ? "high" : score >= 1 ? "medium" : "low";
}
