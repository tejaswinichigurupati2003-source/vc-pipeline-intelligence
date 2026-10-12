import { db } from "@/lib/db/client";
import { composeDraft, type Draft, type DraftSignal, type DraftStyle } from "@/lib/insights/draft";
import { scoreSignals, signalDate } from "@/lib/scoring/score";
import type { StoredSignal } from "@/lib/types";
import { getSettings, getStates } from "./data";

export interface SuggestedDraft {
  vcId: string;
  firm: string;
  person: string | null;
  stage: string;
  score: number | null;
  to: string;
  threadId?: string;
  draft: Draft;
  basedOn: { title: string; url: string; domain: string; date: string | null; type: string } | null;
}

/** The single strongest signal that counted toward the investor's current score, or null when there is none. */
export function strongestSignal(signals: StoredSignal[], now = new Date()): (DraftSignal & { domain: string }) | null {
  const top = scoreSignals(signals, now).items.filter((i) => i.counted).sort((a, b) => b.contribution - a.contribution)[0]?.signal;
  if (!top) return null;
  return {
    title: top.title, evidence_summary: top.evidence_summary, source_url: top.source_url, domain: top.source_domain,
    date: signalDate(top)?.toISOString() ?? null, signal_type: top.signal_type,
  };
}

const REQUEST_STATES = new Set(["deck_requested", "meeting_requested"]);

interface Ctx {
  settings: Record<string, string>;
  materials: { title: string; claim_text: string | null; approved: boolean }[];
  states: Awaited<ReturnType<typeof getStates>>;
}

async function loadCtx(): Promise<Ctx> {
  const [settings, { data: materials }, states] = await Promise.all([
    getSettings(),
    db().from("materials").select("title, claim_text, approved").eq("approved", true),
    getStates(),
  ]);
  return { settings, materials: materials ?? [], states };
}

function make(vc: { id: string; investor_name: string; firm_name: string; contact_status: string; follow_up_score: number | null }, signals: StoredSignal[], email: string, ctx: Ctx, style: DraftStyle): SuggestedDraft {
  const sig = strongestSignal(signals);
  const st = ctx.states[vc.id]?.state;
  const draft = composeDraft({
    founderName: ctx.settings.founder_name ?? "", companyName: ctx.settings.company_name ?? "", oneLiner: ctx.settings.company_one_liner ?? "",
    vc, signal: sig, materials: ctx.materials, relationship: st && REQUEST_STATES.has(st) ? st : null, style,
  });
  return {
    vcId: vc.id, firm: vc.firm_name, person: vc.investor_name !== vc.firm_name ? vc.investor_name : null, stage: vc.contact_status,
    score: vc.follow_up_score, to: email, draft,
    basedOn: sig ? { title: sig.title, url: sig.source_url, domain: sig.domain, date: sig.date, type: sig.signal_type } : null,
  };
}

export async function buildDraftForVc(vcId: string, style: DraftStyle = "standard"): Promise<SuggestedDraft | null> {
  const [ctx, { data: vc }, { data: sigs }, { data: contacts }, { data: ev }] = await Promise.all([
    loadCtx(),
    db().from("vc_pipeline").select("id, investor_name, firm_name, contact_status, follow_up_score").eq("id", vcId).maybeSingle(),
    db().from("vc_signals").select("*").eq("vc_id", vcId),
    db().from("vc_contacts").select("email").eq("vc_id", vcId).not("email", "is", null).limit(1),
    db().from("relationship_events").select("external_ref").eq("vc_id", vcId).eq("kind", "email").order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!vc) return null;
  const out = make(vc, (sigs ?? []) as StoredSignal[], contacts?.[0]?.email ?? "", ctx, style);
  // Reply inside the existing Gmail thread when there is one.
  if (ev?.external_ref?.startsWith("gmail:thread:")) out.threadId = ev.external_ref.slice("gmail:thread:".length);
  return out;
}

/** A suggested message for every open investor, strongest signal first. Closed investors are left out. */
export async function buildAllDrafts(style: DraftStyle = "standard"): Promise<SuggestedDraft[]> {
  const [ctx, { data: vcs }, { data: sigs }, { data: contacts }] = await Promise.all([
    loadCtx(),
    db().from("vc_pipeline").select("id, investor_name, firm_name, contact_status, follow_up_score").neq("contact_status", "closed"),
    db().from("vc_signals").select("*").eq("verification_status", "accepted"),
    db().from("vc_contacts").select("vc_id, email").not("email", "is", null),
  ]);
  const byVc = new Map<string, StoredSignal[]>();
  for (const s of (sigs ?? []) as (StoredSignal & { vc_id: string })[]) byVc.set(s.vc_id, [...(byVc.get(s.vc_id) ?? []), s]);
  const email = new Map<string, string>();
  for (const c of contacts ?? []) if (!email.has(c.vc_id)) email.set(c.vc_id, c.email);
  return (vcs ?? [])
    .map((v) => make(v, byVc.get(v.id) ?? [], email.get(v.id) ?? "", ctx, style))
    .sort((a, b) => Number(!!b.basedOn) - Number(!!a.basedOn) || (b.score ?? -1) - (a.score ?? -1) || a.firm.localeCompare(b.firm));
}
