export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "n/a";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
}

export const STATUS_LABEL: Record<string, string> = {
  yet_to_reach_out: "Yet to reach out",
  waiting_for_response: "Waiting for response",
  in_conversation: "In conversation",
  closed: "Closed",
};
