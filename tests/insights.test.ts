import { describe, expect, it } from "vitest";
import { composeDraft, buildMeetingBrief, followUpChecklist } from "@/lib/insights/brief";
import { fitScore } from "@/lib/insights/fit";
import { roundHealth, DEFAULT_TARGET } from "@/lib/insights/round-health";
import { buildToday, type TodayInput, type TodayVc } from "@/lib/insights/today";
import { effectiveConfidence, findPaths, type GEdge, type GNode } from "@/lib/intros/paths";

const NOW = new Date("2026-10-12T00:00:00Z");
const d = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const vcRow = (id: string, over: Partial<TodayVc> = {}): TodayVc => ({
  id, firm_name: `Firm ${id}`, investor_name: `Firm ${id}`, contact_status: "yet_to_reach_out", last_contact_at: null,
  follow_up_score: 80, recommended_action: "REACH OUT: cite the recent sector signal", signal_summary: "Led a logistics round.", bucket: "reach_out", ...over,
});
const base = (over: Partial<TodayInput> = {}): TodayInput => ({ now: NOW, vcs: [], commitments: [], meetings: [], states: {}, dismissed: {}, ...over });

describe("today actions", () => {
  it("prioritises investor-waiting > commitments > outreach, and caps at 7", () => {
    const vcs = Array.from({ length: 12 }, (_, i) => vcRow(`r${i}`, { follow_up_score: 70 + i }));
    vcs.push(vcRow("w", { bucket: "review", recommended_action: "x" }));
    const t = buildToday(base({ vcs, states: { w: { state: "deck_requested", confirmed: false } }, commitments: [{ id: "c1", vc_id: "r1", text: "Send financials", due_at: d(-1), status: "open", who: "founder" }] }));
    expect(t.actions).toHaveLength(7);
    expect(t.actions[0].type).toBe("respond");
    expect(t.actions[1].type).toBe("commitment_due");
    expect(t.total).toBe(14);
    expect(t.suppressed.some((s) => /Lower priority/.test(s.reason))).toBe(true);
  });
  it("explains suppressed alternatives: HOLD (recent), stale, quiet, closed", () => {
    const t = buildToday(base({ vcs: [
      vcRow("hold", { contact_status: "waiting_for_response", last_contact_at: d(3), bucket: "hold" }),
      vcRow("stale", { bucket: "stale" }), vcRow("quiet", { bucket: "quiet", recommended_action: "SKIP" }), vcRow("closed", { bucket: "closed", contact_status: "closed" }),
    ] }));
    expect(t.actions).toHaveLength(0);
    const why = t.suppressed.map((s) => s.reason).join(" | ");
    expect(why).toMatch(/only 3d since last contact/);
    expect(why).toMatch(/Last scan failed/);
    expect(why).toMatch(/Quiet/);
    expect(why).toMatch(/Closed/);
  });
  it("follows up on silence after N days, but not when a relationship state exists", () => {
    const vcs = [vcRow("a", { contact_status: "waiting_for_response", last_contact_at: d(12), bucket: "hold" })];
    expect(buildToday(base({ vcs })).actions[0]).toMatchObject({ type: "follow_up", vcId: "a" });
    expect(buildToday(base({ vcs, states: { a: { state: "waiting_for_investor", confirmed: false } } })).actions).toHaveLength(0);
  });
  it("dismissed actions are hidden for 14 days then return", () => {
    const vcs = [vcRow("a")];
    expect(buildToday(base({ vcs, dismissed: { "reach:a": d(3) } })).actions).toHaveLength(0);
    expect(buildToday(base({ vcs, dismissed: { "reach:a": d(20) } })).actions).toHaveLength(1);
  });
  it("labels provenance: inferred vs user-confirmed relationship actions", () => {
    const vcs = [vcRow("a", { bucket: "review" })];
    expect(buildToday(base({ vcs, states: { a: { state: "awaiting_founder", confirmed: false } } })).actions[0].provenance).toBe("inferred");
    expect(buildToday(base({ vcs, states: { a: { state: "awaiting_founder", confirmed: true } } })).actions[0].provenance).toBe("user_confirmed");
  });
  it("meeting prep and post-meeting follow-up appear in their windows", () => {
    const vcs = [vcRow("a", { bucket: "review" })];
    const soon = buildToday(base({ vcs, meetings: [{ id: "m", vc_id: "a", title: "Intro", start_at: new Date(NOW.getTime() + 86_400_000).toISOString(), notes_confirmed: false, followup_done: false, included: true }] }));
    expect(soon.actions[0].type).toBe("meeting_prep");
    const past = buildToday(base({ vcs, meetings: [{ id: "m", vc_id: "a", title: "Intro", start_at: d(2), notes_confirmed: false, followup_done: false, included: true }] }));
    expect(past.actions[0].type).toBe("post_meeting");
    const excluded = buildToday(base({ vcs, meetings: [{ id: "m", vc_id: "a", title: "Intro", start_at: d(2), notes_confirmed: false, followup_done: false, included: false }] }));
    expect(excluded.actions).toHaveLength(0);
  });
});

describe("fit and round health", () => {
  it("scores stage + geography + sector from thesis text only", () => {
    expect(fitScore({ investment_thesis: "Seed-stage B2B logistics and supply chain, India", sector_keywords: [], firm_name: "x" }).score).toBe(100);
    expect(fitScore({ investment_thesis: "Early-stage tech startups, India", sector_keywords: [], firm_name: "x" }).score).toBe(70);
    expect(fitScore({ investment_thesis: null, sector_keywords: [], firm_name: "x" }).score).toBe(0);
  });
  it("computes coverage, distribution and gaps against targets", () => {
    const vcs = [
      ...Array(6).fill(0).map(() => ({ contact_status: "yet_to_reach_out", follow_up_score: 80, bucket: "reach_out", fit: 80 })),
      ...Array(3).fill(0).map(() => ({ contact_status: "waiting_for_response", follow_up_score: 10, bucket: "hold", fit: 50 })),
      { contact_status: "in_conversation", follow_up_score: 50, bucket: "review", fit: 90 }, { contact_status: "closed", follow_up_score: 0, bucket: "closed", fit: 10 },
      { contact_status: "yet_to_reach_out", follow_up_score: null, bucket: "stale", fit: 10 },
    ];
    const h = roundHealth({ vcs, target: DEFAULT_TARGET });
    expect(h).toMatchObject({ total: 12, contacted: 5, active: 1, stale: 1, hotNow: 6, coveragePct: 42 });
    expect(h.gaps.join(" ")).toMatch(/more investors to contact.*more live conversations.*stale data/s);
  });
});

describe("drafts and briefs only use verified/approved content", () => {
  const base = { founderName: "Vikram", companyName: "RouteIQ", oneLiner: "We build freight visibility SaaS.", vc: { investor_name: "Jane Doe", firm_name: "Route Ventures" } };
  const signal = { evidence_summary: "Route Ventures led a $6M Series A in TruckLens.", source_url: "https://news.example/a", date: "2026-10-08T00:00:00Z" };
  it("includes approved claims and the linked signal; excludes unapproved ones", () => {
    const out = composeDraft({ ...base, signal, relationship: null, materials: [{ title: "ARR", claim_text: "ARR is $1.2M", approved: true }, { title: "Secret", claim_text: "UNAPPROVED CLAIM", approved: false }] });
    expect(out.body).toContain("ARR is $1.2M");
    expect(out.body).not.toContain("UNAPPROVED");
    expect(out.body).toContain("https://news.example/a");
    expect(out.body).toContain("Hi Jane,");
    expect(out.body).not.toMatch(/you are interested|you're interested|your interest/i);
  });
  it("warns instead of inventing when there is no signal or no approved claims", () => {
    const out = composeDraft({ ...base, signal: null, relationship: null, materials: [] });
    expect(out.warnings.join(" ")).toMatch(/No verified public signal/);
    expect(out.warnings.join(" ")).toMatch(/No approved company claims/);
    expect(out.body).not.toContain("I noticed");
  });
  it("adapts to relationship state without claiming facts", () => {
    expect(composeDraft({ ...base, signal: null, relationship: "deck_requested", materials: [] }).subject).toMatch(/deck/);
  });
  it("brief: hides unapproved material, says so when there is no evidence, builds questions from real signal types", () => {
    const b = buildMeetingBrief({
      vc: { firm_name: "Route Ventures", investor_name: "Jane Doe", investment_thesis: "Seed logistics", contact_status: "in_conversation" },
      meeting: { title: "Intro", start_at: "2026-10-14T10:00:00Z" },
      signals: [{ title: "t", source_url: "u", source_domain: "d", date: null, signal_type: "portfolio_investment", evidence_summary: "s", confidence: "high" }],
      interactions: [], commitments: [{ text: "send deck", due_at: null, status: "open", who: "founder" }, { text: "old", due_at: null, status: "done", who: "founder" }],
      materials: [{ title: "a", claim_text: "ok", approved: true }, { title: "b", claim_text: "no", approved: false }], diligence: [{ request_text: "cap table", status: "open" }],
    });
    expect(b.proofPoints).toHaveLength(1);
    expect(b.unapprovedMaterialsHidden).toBe(1);
    expect(b.openCommitments).toHaveLength(1);
    expect(b.suggestedQuestions[0]).toMatch(/recently backed/);
    expect(buildMeetingBrief({ ...{ vc: { firm_name: "F", investor_name: "F", investment_thesis: null, contact_status: "yet_to_reach_out" }, meeting: { title: null, start_at: "x" }, interactions: [], commitments: [], materials: [], diligence: [] }, signals: [] }).noEvidenceNote).toMatch(/not proof/);
  });
  it("follow-up checklist reflects confirmed notes and open items", () => {
    const l = followUpChecklist({ notes: "They asked for the deck and an intro to a logistics founder. Next steps: partner meeting.", openCommitments: ["Send model"], diligence: ["Cap table"] });
    expect(l.join("|")).toMatch(/materials.*introductions.*next step.*Commitment: Send model.*Diligence request: Cap table/);
  });
});

describe("warm introduction paths", () => {
  const nodes: GNode[] = [
    { id: "f", kind: "founder", label: "Founder", vc_id: null }, { id: "c", kind: "contact", label: "Colleague", vc_id: null },
    { id: "p", kind: "portfolio_founder", label: "Portfolio founder", vc_id: null }, { id: "v", kind: "vc", label: "Route Ventures", vc_id: "VC1" },
    { id: "m", kind: "vc_partner", label: "Partner", vc_id: "VC1" },
  ];
  const e = (id: string, a: string, b: string, over: Partial<GEdge> = {}): GEdge => ({
    id, from_node: a, to_node: b, relation_type: "knows", provenance: "user_supplied", confidence: 0.8, last_observed_at: d(10), user_confirmed: true, can_act: true, visibility: "founder_only", ...over,
  });
  it("finds Founder -> colleague -> portfolio founder -> VC and labels it a possible path", () => {
    const p = findPaths(nodes, [e("1", "f", "c"), e("2", "c", "p"), e("3", "p", "v", { relation_type: "invested_in" })], "VC1", NOW);
    expect(p[0].nodes.map((n) => n.label)).toEqual(["Founder", "Colleague", "Portfolio founder", "Route Ventures"]);
    expect(p[0]).toMatchObject({ label: "possible introduction path", actionable: true, hops: 3 });
    expect(p[0].confidence).toBeCloseTo(0.512, 3);
  });
  it("unconfirmed edges are capped at 0.4 and make the path non-actionable", () => {
    const p = findPaths(nodes, [e("1", "f", "m", { relation_type: "spoke_with", provenance: "meeting", confidence: 0.9, user_confirmed: false, can_act: false })], "VC1", NOW);
    expect(p[0].confidence).toBe(0.4);
    expect(p[0].actionable).toBe(false);
    expect(p[0].needsConfirmation).toHaveLength(1);
  });
  it("prefers actionable paths, decays stale edges, respects max hops, and needs a founder node", () => {
    const direct = e("1", "f", "m", { confidence: 0.3 });
    const long = [e("2", "f", "c", { confidence: 0.95 }), e("3", "c", "m", { confidence: 0.95 })];
    expect(findPaths(nodes, [direct, ...long], "VC1", NOW)[0].hops).toBe(2); // higher confidence wins when both actionable
    expect(effectiveConfidence(e("x", "f", "c", { last_observed_at: d(400) }), NOW)).toEqual({ value: 0.56, stale: true });
    expect(findPaths(nodes, long, "VC1", NOW, { maxHops: 1 })).toHaveLength(0);
    expect(findPaths(nodes.filter((n) => n.kind !== "founder"), long, "VC1", NOW)).toEqual([]);
  });
  it("never loops through the same person twice", () => {
    const p = findPaths(nodes, [e("1", "f", "c"), e("2", "c", "f"), e("3", "c", "m")], "VC1", NOW);
    for (const path of p) expect(new Set(path.nodes.map((n) => n.id)).size).toBe(path.nodes.length);
  });
});
