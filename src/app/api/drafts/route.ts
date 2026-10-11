import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { db } from "@/lib/db/client";
import { createGmailDraft } from "@/lib/google/gmail";
import { composeDraft } from "@/lib/insights/brief";
import { scoreSignals, signalDate } from "@/lib/scoring/score";
import type { StoredSignal } from "@/lib/types";
import { getSettings } from "@/lib/workspace/data";

export const dynamic = "force-dynamic";

const Body = z.object({ vc_id: z.string().uuid(), create: z.boolean().default(false) });

/**
 * Composes a draft from a verified public signal + APPROVED company claims only.
 * With create=true it saves a Gmail DRAFT (never sends). The founder reviews and sends from Gmail.
 */
export const POST = adminRoute(Body, async ({ vc_id, create }) => {
  const { data: vc } = await db().from("vc_pipeline").select("id, investor_name, firm_name").eq("id", vc_id).maybeSingle();
  if (!vc) throw new Error("investor not found");
  const s = await getSettings();
  const { data: sigs } = await db().from("vc_signals").select("*").eq("vc_id", vc_id);
  const scored = scoreSignals((sigs ?? []) as StoredSignal[], new Date());
  const top = scored.items.filter((i) => i.counted).sort((a, b) => b.contribution - a.contribution)[0]?.signal ?? null;
  const { data: materials } = await db().from("materials").select("title, claim_text, approved").eq("approved", true);
  const { data: contacts } = await db().from("vc_contacts").select("email").eq("vc_id", vc_id).not("email", "is", null).limit(1);
  const { data: ev } = await db().from("relationship_events").select("state, external_ref").eq("vc_id", vc_id).eq("kind", "email").order("occurred_at", { ascending: false }).limit(1).maybeSingle();

  const draft = composeDraft({
    founderName: s.founder_name ?? "", companyName: s.company_name ?? "", oneLiner: s.company_one_liner ?? "",
    vc, signal: top ? { evidence_summary: top.evidence_summary, source_url: top.source_url, date: signalDate(top)?.toISOString() ?? null } : null,
    materials: materials ?? [], relationship: ev?.state ?? null,
  });
  if (!create) return { draft, to: contacts?.[0]?.email ?? "" };
  const threadId = ev?.external_ref?.startsWith("gmail:thread:") ? ev.external_ref.slice("gmail:thread:".length) : undefined;
  const created = await createGmailDraft({ to: contacts?.[0]?.email ?? "", subject: draft.subject, body: draft.body, threadId });
  return { draft, created };
});
