/** "Today / This week": 3-7 prioritised actions with reasons, plus why alternatives were suppressed (spec 26 dashboard). Pure. */

export type ActionType = "respond" | "commitment_due" | "post_meeting" | "meeting_prep" | "reach_out" | "follow_up";
export type Provenance = "verified" | "inferred" | "user_confirmed";

export const ACTION_LABEL: Record<ActionType, string> = {
  respond: "Reply", commitment_due: "Commitments", post_meeting: "Post-meeting follow-up",
  meeting_prep: "Meeting prep", reach_out: "Reach out", follow_up: "Follow up",
};

export interface TodayVc {
  id: string; firm_name: string; investor_name: string; contact_status: string; last_contact_at: string | null;
  follow_up_score: number | null; recommended_action: string | null; signal_summary: string | null; bucket: string;
  top_signal_url?: string | null;
}
export interface TodayInput {
  now: Date;
  vcs: TodayVc[];
  commitments: { id: string; vc_id: string | null; text: string; due_at: string | null; status: string; who: string }[];
  meetings: { id: string; vc_id: string | null; title: string | null; start_at: string; notes_confirmed: boolean; followup_done: boolean; included: boolean }[];
  states: Record<string, { state: string; confirmed: boolean }>;
  dismissed: Record<string, string>; // action key -> ISO time dismissed
  followUpAfterDays?: number;
  max?: number;
}
export interface TodayAction {
  key: string; type: ActionType; vcId: string | null; title: string; reason: string; priority: number;
  provenance: Provenance; sourceUrl?: string | null;
}
export interface Suppressed { vcId: string; firm: string; reason: string }

const DAY = 86_400_000;
const DISMISS_DAYS = 14;

export function buildToday(i: TodayInput): { actions: TodayAction[]; suppressed: Suppressed[]; shown: number; total: number } {
  const followAfter = i.followUpAfterDays ?? 10;
  const max = Math.min(7, i.max ?? 7);
  const vcName = new Map(i.vcs.map((v) => [v.id, v.firm_name]));
  const all: TodayAction[] = [];
  const suppressed: Suppressed[] = [];
  const claimed = new Set<string>(); // a VC gets one primary action per type family; relationship actions beat outreach

  const dismissedRecently = (key: string) => {
    const t = i.dismissed[key];
    return !!t && i.now.getTime() - new Date(t).getTime() < DISMISS_DAYS * DAY;
  };
  const push = (a: TodayAction) => {
    if (dismissedRecently(a.key)) { suppressed.push({ vcId: a.vcId ?? "", firm: vcName.get(a.vcId ?? "") ?? "", reason: `Dismissed by you in the last ${DISMISS_DAYS} days: ${a.title}` }); return; }
    all.push(a);
  };

  // 1. Investor is waiting on the founder (private connected data, rule-classified unless confirmed).
  for (const [vcId, s] of Object.entries(i.states)) {
    if (!["awaiting_founder", "deck_requested", "meeting_requested"].includes(s.state)) continue;
    const label = s.state === "deck_requested" ? "Send the deck they asked for" : s.state === "meeting_requested" ? "Reply to their meeting request" : "Reply: they wrote last";
    push({
      key: `respond:${vcId}`, type: "respond", vcId, title: `${vcName.get(vcId) ?? "Investor"}: ${label}`, priority: 100,
      reason: s.confirmed ? "You confirmed this relationship state." : "Inferred from the last email in the thread (rule-based); confirm or correct it.",
      provenance: s.confirmed ? "user_confirmed" : "inferred",
    });
    claimed.add(vcId);
  }

  // 2. Commitments due.
  for (const c of i.commitments) {
    if (!c.vc_id || c.who !== "founder" || !["open", "proposed"].includes(c.status) || !c.due_at) continue;
    const days = (new Date(c.due_at).getTime() - i.now.getTime()) / DAY;
    if (days > 7) continue;
    push({
      key: `commitment:${c.id}`, type: "commitment_due", vcId: c.vc_id, title: `${vcName.get(c.vc_id) ?? "Investor"}: ${c.text.slice(0, 90)}`,
      priority: days < 0 ? 98 : 90, reason: days < 0 ? `Overdue by ${Math.ceil(-days)}d.` : `Due in ${Math.max(0, Math.ceil(days))}d.`,
      provenance: c.status === "open" ? "user_confirmed" : "inferred",
    });
  }

  // 3. Meetings: prep for upcoming (<=3d), follow-up for recent (<=7d) once notes are confirmed.
  for (const m of i.meetings) {
    if (!m.vc_id || !m.included) continue;
    const d = (new Date(m.start_at).getTime() - i.now.getTime()) / DAY;
    if (d >= 0 && d <= 3) push({ key: `prep:${m.id}`, type: "meeting_prep", vcId: m.vc_id, title: `Prepare: ${m.title ?? "meeting"} with ${vcName.get(m.vc_id)}`, priority: 80, reason: `Meeting in ${Math.ceil(d)}d. Open the brief.`, provenance: "verified" });
    if (d < 0 && d >= -7 && !m.followup_done) push({ key: `post:${m.id}`, type: "post_meeting", vcId: m.vc_id, title: `Follow up after: ${m.title ?? "meeting"} with ${vcName.get(m.vc_id)}`, priority: 85, reason: `Met ${Math.ceil(-d)}d ago${m.notes_confirmed ? "" : "; add your notes to build the checklist"}.`, provenance: "verified" });
    if (d >= 0 && d <= 3) claimed.add(m.vc_id);
  }

  // 4. Outreach from verified public signals, and follow-ups on silence.
  for (const v of i.vcs) {
    const fam = `outreach:${v.id}`;
    if (v.bucket === "closed") { suppressed.push({ vcId: v.id, firm: v.firm_name, reason: "Closed." }); continue; }
    if (v.bucket === "stale") { suppressed.push({ vcId: v.id, firm: v.firm_name, reason: "Last scan failed: not shown as quiet or active until a refresh succeeds." }); continue; }
    if (claimed.has(v.id) && v.contact_status !== "yet_to_reach_out") continue;
    if (v.bucket === "reach_out" && v.contact_status === "yet_to_reach_out") {
      push({ key: `reach:${v.id}`, type: "reach_out", vcId: v.id, title: `Reach out to ${v.firm_name}`, priority: 50 + Math.round((v.follow_up_score ?? 0) / 4), // max 75: never outranks a due commitment (90) or a reply (100)
        reason: v.signal_summary ?? "Fresh verified public signal.", provenance: "verified", sourceUrl: v.top_signal_url });
      continue;
    }
    if (v.contact_status === "waiting_for_response") {
      const since = v.last_contact_at ? (i.now.getTime() - new Date(v.last_contact_at).getTime()) / DAY : null;
      if (since !== null && since >= followAfter && !i.states[v.id]) {
        push({ key: `follow:${v.id}`, type: "follow_up", vcId: v.id, title: `Follow up with ${v.firm_name}`, priority: 40 + Math.min(20, Math.round(since - followAfter)),
          reason: `No reply logged in ${Math.floor(since)}d since your last contact (${new Date(v.last_contact_at!).toISOString().slice(0, 10)}).`, provenance: "user_confirmed" });
      } else {
        suppressed.push({ vcId: v.id, firm: v.firm_name, reason: since === null ? "Awaiting a reply; no contact date recorded." : `Awaiting a reply; only ${Math.floor(since)}d since last contact (follow up after ${followAfter}d).` });
      }
      continue;
    }
    if (v.bucket === "quiet") suppressed.push({ vcId: v.id, firm: v.firm_name, reason: "Quiet: no verified public trigger in 30 days (not proof of inactivity)." });
    else if (v.bucket === "review") suppressed.push({ vcId: v.id, firm: v.firm_name, reason: "Medium signal: check thesis/stage fit first, so not promoted to an action." });
    void fam;
  }

  all.sort((a, b) => b.priority - a.priority);
  const actions = all.slice(0, max);
  for (const a of all.slice(max)) suppressed.push({ vcId: a.vcId ?? "", firm: vcName.get(a.vcId ?? "") ?? "", reason: `Lower priority than today's ${max} (${ACTION_LABEL[a.type]}: ${a.title}).` });
  return { actions, suppressed: suppressed.slice(0, 40), shown: actions.length, total: all.length };
}

export function groupByType(actions: TodayAction[]): [ActionType, TodayAction[]][] {
  const order: ActionType[] = ["respond", "commitment_due", "post_meeting", "meeting_prep", "reach_out", "follow_up"];
  return order.map((t) => [t, actions.filter((a) => a.type === t)] as [ActionType, TodayAction[]]).filter(([, l]) => l.length);
}
