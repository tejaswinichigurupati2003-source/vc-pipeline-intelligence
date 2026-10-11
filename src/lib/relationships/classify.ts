/**
 * Deterministic relationship-state classifier for investor email threads (spec 26.2).
 * Looks only at headers + the snippet of the LAST message, never at full bodies. Output is a suggestion
 * (state_confidence = 'rule'); the founder can confirm or correct it in the UI.
 */

export const RELATIONSHIP_STATES = [
  "interested", "meeting_requested", "deck_requested", "awaiting_founder", "waiting_for_investor", "pass", "reconnect_later",
] as const;
export type RelationshipState = (typeof RELATIONSHIP_STATES)[number];

export const STATE_LABEL: Record<RelationshipState, string> = {
  interested: "Interested", meeting_requested: "Meeting requested", deck_requested: "Deck requested",
  awaiting_founder: "Awaiting you", waiting_for_investor: "Waiting for investor", pass: "Pass", reconnect_later: "Reconnect later",
};

// Evaluated in priority order: a polite pass beats "interested" words later in the same snippet.
const RULES: { state: RelationshipState; re: RegExp }[] = [
  { state: "pass", re: /\b(not (a )?(fit|right fit|the right fit)|pass on (this|it|the)|going to pass|will pass|unfortunately|not (going to be )?invest|decline|no longer (investing|looking)|not (a )?(focus|priority) (for us|right now))\b/i },
  { state: "reconnect_later", re: /\b(reconnect|circle back|check back|touch base (in|again)|revisit|next (quarter|year)|when you (raise|are raising|have more)|too early|keep (us|me) (posted|updated)|stay in touch)\b/i },
  { state: "deck_requested", re: /\b((send|share|forward)( over)?( me)?( us)?( the| your| a)? (pitch )?(deck|presentation|one[- ]?pager|teaser)|pitch deck|data ?room|financials? (model|deck)|would love (to see )?(the|your) deck)\b/i },
  { state: "meeting_requested", re: /\b(set up (a )?(call|time|meeting)|schedule (a )?(call|time|meeting)|book (a )?(call|time|slot)|grab (some )?time|find (a )?time|catch up|happy to (chat|talk|meet)|calendly\.com|cal\.com|are you (free|available)|available (for|on|this|next)|let'?s (chat|talk|connect|meet))\b/i },
  { state: "interested", re: /\b(interested|excited|intrigued|love to (learn|hear|know)|sounds (interesting|great|promising)|keen|impressed|like what (you|i)|would like to (learn|know|understand))\b/i },
];

export interface ThreadFacts {
  /** True if the most recent message in the thread was sent by the founder's own mailbox. */
  lastFromFounder: boolean;
  /** Snippet of the most recent message from the INVESTOR side (may be older than the last message). */
  lastInvestorSnippet: string;
  subject?: string;
}

export function classifyThread(t: ThreadFacts): { state: RelationshipState; reason: string } {
  if (t.lastFromFounder) return { state: "waiting_for_investor", reason: "Your message was the last in the thread" };
  const text = `${t.subject ?? ""} ${t.lastInvestorSnippet}`;
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) return { state: r.state, reason: `Matched "${m[0].slice(0, 40)}" in the investor's last message` };
  }
  return { state: "awaiting_founder", reason: "Investor replied last; no specific request detected" };
}

/** Map a relationship state to a suggestion for `contact_status` (never auto-applied; shown to the founder). */
export function suggestContactStatus(state: RelationshipState): "waiting_for_response" | "in_conversation" | "closed" | null {
  switch (state) {
    case "waiting_for_investor": return "waiting_for_response";
    case "interested": case "meeting_requested": case "deck_requested": case "awaiting_founder": return "in_conversation";
    case "pass": return "closed";
    default: return null;
  }
}
