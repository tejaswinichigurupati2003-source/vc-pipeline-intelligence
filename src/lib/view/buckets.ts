export type Bucket = "reach_out" | "review" | "hold" | "quiet" | "stale" | "closed" | "unscanned";

export const BUCKET_ORDER: Bucket[] = ["reach_out", "review", "hold", "quiet", "stale", "unscanned", "closed"];

export const BUCKET_META: Record<Bucket, { title: string; blurb: string }> = {
  reach_out: { title: "Reach out now", blurb: "Not yet contacted, with a strong, fresh, verified signal." },
  review: { title: "Review", blurb: "Medium signal, timing to check, or live conversations with something new to reference." },
  hold: { title: "Hold", blurb: "Already waiting on a reply. Avoid duplicate follow-up." },
  quiet: { title: "Quiet: skip this week", blurb: "Not found by the system. This is not proof the VC is inactive." },
  stale: { title: "Data stale: scan failed", blurb: "Refresh failed. Last good values shown. This is not the same as quiet." },
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
  return score >= 70 ? "high" : score >= 40 ? "medium" : "low";
}
