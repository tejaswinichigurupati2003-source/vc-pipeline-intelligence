/** Pre-meeting brief and draft composer. Deterministic templates: no model-written claims about the investor or the company. */

export interface BriefInput {
  vc: { firm_name: string; investor_name: string; investment_thesis: string | null; contact_status: string };
  meeting: { title: string | null; start_at: string };
  signals: { title: string; source_url: string; source_domain: string; date: string | null; signal_type: string; evidence_summary: string; confidence: string }[];
  interactions: { kind: string; title: string | null; state: string | null; occurred_at: string; link_url: string | null; provenance: string }[];
  commitments: { text: string; due_at: string | null; status: string; who: string }[];
  materials: { title: string; claim_text: string | null; approved: boolean }[];
  diligence: { request_text: string; status: string }[];
}

const QUESTION_BY_TYPE: Record<string, string> = {
  portfolio_investment: "You recently backed a company in this space: what did you see in it, and where do you still see gaps?",
  investor_thesis: "You've written about this market: what would you need to see from a seed-stage company to act on that view?",
  investor_commentary: "You commented on this market recently: how does that shape what you look for at seed?",
  event_appearance: "You spoke on this topic recently: what questions from that audience stayed with you?",
  fund_activity: "How does the fund's current focus affect seed-stage cheque size and timing?",
  portfolio_activity: "How do you think about overlap with your existing portfolio companies in logistics?",
};

export function buildMeetingBrief(i: BriefInput) {
  const fresh = i.signals.slice(0, 3);
  const questions = [...new Set(fresh.map((s) => QUESTION_BY_TYPE[s.signal_type]).filter(Boolean))];
  questions.push("What does your process and timeline look like from this conversation to a decision?");
  if (i.vc.contact_status === "in_conversation") questions.push("What would make this a clear yes, and what are the biggest open concerns?");
  const proof = i.materials.filter((m) => m.approved && m.claim_text).map((m) => ({ title: m.title, claim: m.claim_text! }));
  return {
    heading: `${i.meeting.title ?? "Meeting"} with ${i.vc.investor_name === i.vc.firm_name ? i.vc.firm_name : `${i.vc.investor_name} (${i.vc.firm_name})`}`,
    when: i.meeting.start_at,
    thesis: i.vc.investment_thesis ?? "No thesis notes yet: add them to the investor record.",
    freshEvidence: fresh.map((s) => ({ ...s, label: s.confidence === "high" ? "verified" : "verified (medium confidence)" })),
    noEvidenceNote: fresh.length ? null : "No verified public signal in the last 30 days. This is not proof the investor is inactive.",
    priorInteractions: i.interactions.slice(0, 6),
    openCommitments: i.commitments.filter((c) => ["open", "proposed"].includes(c.status)),
    suggestedQuestions: questions.slice(0, 5),
    proofPoints: proof,
    unapprovedMaterialsHidden: i.materials.filter((m) => !m.approved).length,
    openDiligence: i.diligence.filter((d) => d.status !== "provided"),
  };
}

export function followUpChecklist(i: { notes: string; openCommitments: string[]; diligence: string[] }): string[] {
  const items = ["Send a short thank-you with the key points you agreed on."];
  const n = i.notes.toLowerCase();
  if (/\b(deck|materials?|data ?room|financials?)\b/.test(n)) items.push("Send the materials they asked for (approved items only).");
  if (/\b(intro|introduce|connect)\b/.test(n)) items.push("Make or accept the introductions mentioned in your notes.");
  if (/\b(next steps?|follow[- ]?up|second meeting|partner meeting)\b/.test(n)) items.push("Confirm the agreed next step and propose a date.");
  for (const c of i.openCommitments) items.push(`Commitment: ${c}`);
  for (const d of i.diligence) items.push(`Diligence request: ${d}`);
  items.push("Update the investor's status and add a dated note.");
  return items;
}
