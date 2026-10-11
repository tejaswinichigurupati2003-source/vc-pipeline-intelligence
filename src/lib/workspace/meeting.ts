import { db } from "@/lib/db/client";
import { buildMeetingBrief } from "@/lib/insights/brief";
import { scoreSignals, signalDate } from "@/lib/scoring/score";
import type { StoredSignal } from "@/lib/types";
export async function loadBrief(meetingId: string) {
  const { data: m } = await db().from("calendar_events").select("*").eq("id", meetingId).maybeSingle();
  if (!m || !m.vc_id) return null;
  const { data: vc } = await db().from("vc_pipeline").select("firm_name, investor_name, investment_thesis, contact_status").eq("id", m.vc_id).maybeSingle();
  if (!vc) return null;
  const { data: sigs } = await db().from("vc_signals").select("*").eq("vc_id", m.vc_id);
  const scored = scoreSignals((sigs ?? []) as StoredSignal[], new Date());
  const signals = scored.items.filter((i) => i.counted).sort((a, b) => b.contribution - a.contribution).map((i) => ({
    title: i.signal.title, source_url: i.signal.source_url, source_domain: i.signal.source_domain, date: signalDate(i.signal)?.toISOString() ?? null,
    signal_type: i.signal.signal_type, evidence_summary: i.signal.evidence_summary, confidence: i.signal.confidence,
  }));
  const { data: interactions } = await db().from("relationship_events").select("kind, title, state, occurred_at, link_url, provenance").eq("vc_id", m.vc_id).order("occurred_at", { ascending: false }).limit(6);
  const { data: commitments } = await db().from("commitments").select("text, due_at, status, who").eq("vc_id", m.vc_id);
  const { data: materials } = await db().from("materials").select("title, claim_text, approved");
  const { data: diligence } = await db().from("diligence_requests").select("request_text, status").eq("vc_id", m.vc_id);
  return {
    meeting: m,
    brief: buildMeetingBrief({ vc, meeting: { title: m.title, start_at: m.start_at }, signals, interactions: interactions ?? [], commitments: commitments ?? [], materials: materials ?? [], diligence: diligence ?? [] }),
    commitments: commitments ?? [], diligence: diligence ?? [],
  };
}

