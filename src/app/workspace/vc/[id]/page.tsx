import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiButton, ApiForm, Badge } from "@/components/ui";
import DraftPanel from "@/components/DraftPanel";
import InvestorHero from "@/components/InvestorHero";
import { db } from "@/lib/db/client";
import { getVcDetail } from "@/lib/db/read";
import { fitScore } from "@/lib/insights/fit";
import { pathsForVc } from "@/lib/intros/service";
import { signalDate } from "@/lib/scoring/score";
import { STATE_LABEL, type RelationshipState } from "@/lib/relationships/classify";
import { fmtDate, fmtDateTime, STATUS_LABEL } from "@/lib/view/format";

export const dynamic = "force-dynamic";

type Item = { at: number; node: React.ReactNode; key: string };

export default async function WorkspaceVc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getVcDetail(id, true); // admin-gated layout: private notes allowed
  if (!d) notFound();
  const { vc, score } = d;
  const { data: events } = await db().from("relationship_events").select("*").eq("vc_id", id);
  const { data: meetings } = await db().from("calendar_events").select("*").eq("vc_id", id);
  const { data: commitments } = await db().from("commitments").select("*").eq("vc_id", id).in("status", ["proposed", "open"]);
  const { data: dd } = await db().from("diligence_requests").select("*").eq("vc_id", id);
  const paths = await pathsForVc(id);
  const fit = fitScore({ investment_thesis: vc.investment_thesis, sector_keywords: [], firm_name: vc.firm_name });

  const items: Item[] = [];
  // Public evidence (blue)
  for (const it of score.items) {
    const s = it.signal; const t = signalDate(s)?.getTime() ?? 0;
    items.push({ key: `s${s.id}`, at: t, node: (
      <div className={it.counted ? "" : "opacity-60"}>
        <div className="flex flex-wrap items-center gap-2"><Badge kind="public">Public</Badge><Badge kind={s.confidence === "high" ? "verified" : "inferred"}>{s.confidence === "high" ? "Verified" : "Verified, medium"}</Badge>
          <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="font-medium">{s.title}</a></div>
        <div className="text-xs text-slate-500">{fmtDate(new Date(t).toISOString())} · {s.signal_type.replace(/_/g, " ")} · {s.source_domain} · {it.counted ? `+${it.contribution.toFixed(1)} pts` : it.note ?? "not scored"}</div>
        <p className="text-sm">{s.evidence_summary}</p>
        {s.verification_status === "accepted" && <div className="mt-1"><ApiButton url={`/api/vc/${id}`} method="PATCH" body={{ signal_id: s.id }} label="This signal is wrong" tone="danger" /></div>}
        {s.verification_status === "rejected_by_user" && <Badge kind="warn">You marked this wrong</Badge>}
      </div>) });
  }
  // Private connected (violet) + your notes (green)
  for (const e of events ?? []) {
    items.push({ key: `e${e.id}`, at: new Date(e.occurred_at).getTime(), node: (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {e.provenance === "user" ? <Badge kind="note">Your note</Badge> : <Badge kind="private">{e.provenance === "gmail" ? "Gmail" : "Calendar"} · private</Badge>}
          {e.state && <Badge kind={e.state_confidence === "user_confirmed" ? "confirmed" : "inferred"}>{STATE_LABEL[e.state as RelationshipState]}{e.state_confidence === "user_confirmed" ? "" : " (inferred)"}</Badge>}
          {e.link_url ? <a href={e.link_url} target="_blank" rel="noopener noreferrer" className="font-medium">{e.title}</a> : <span className="font-medium">{e.title}</span>}
        </div>
        <div className="text-xs text-slate-500">{fmtDateTime(e.occurred_at)}{e.summary ? ` · ${e.summary}` : ""}</div>
      </div>) });
  }
  for (const m of meetings ?? []) {
    items.push({ key: `m${m.id}`, at: new Date(m.start_at).getTime(), node: (
      <div className="flex flex-wrap items-center gap-2"><Badge kind="private">Calendar · private</Badge><span className="font-medium">{m.title}</span><span className="text-xs text-slate-500">{fmtDateTime(m.start_at)}</span><Link href={`/workspace/meetings/${m.id}`} className="text-xs">Brief</Link></div>) });
  }
  items.sort((a, b) => b.at - a.at);

  return (
    <main className="max-w-4xl">
      <InvestorHero vc={vc} backHref="/workspace/pipeline" backLabel="All investors" />

      <section className="card mb-6 p-5">
        <h2 className="mb-3">Your private notes</h2>
        <dl className="grid gap-4 text-[0.9rem] md:grid-cols-2">
          <div><dt className="eyebrow">Contact history</dt><dd className="mt-1 text-slate-700">{vc.contact_history || "None yet"}</dd></div>
          <div><dt className="eyebrow">Notes</dt><dd className="mt-1 text-slate-700">{vc.personal_notes || "None yet"}</dd></div>
        </dl>
      </section>
      <DraftPanel vcId={id} />

      <section className="mt-6">
        <h2 className="font-semibold">Introduction paths <Badge kind="neutral">possible</Badge></h2>
        {!paths.length && <p className="text-sm text-slate-500">No path found in the contacts you have shared.</p>}
        <ul className="space-y-1 text-sm">{paths.map((p, i) => <li key={i}>{p.nodes.map((n) => n.label).join(" → ")} <span className="text-xs text-slate-500">(confidence {p.confidence}; {p.actionable ? "confirmed" : `${p.needsConfirmation.length} edge(s) need your confirmation`})</span></li>)}</ul>
      </section>

      {!!commitments?.length && (
        <section className="mt-6"><h2 className="font-semibold">Open commitments</h2>
          <ul className="text-sm">{commitments.map((c) => <li key={c.id}>{c.who === "founder" ? "You" : "Investor"}: {c.text} (due {fmtDate(c.due_at)}) {c.status === "proposed" && <Badge kind="inferred">proposed</Badge>}</li>)}</ul></section>
      )}
      {!!dd?.length && (
        <section className="mt-6"><h2 className="font-semibold">Diligence</h2>
          <ul className="text-sm">{dd.map((x) => <li key={x.id}>{x.request_text} <Badge kind={x.status === "provided" ? "verified" : "inferred"}>{x.status}</Badge></li>)}</ul></section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Unified timeline</h2>
        <p className="mb-2 text-xs text-slate-500"><Badge kind="public">Public</Badge> evidence · <Badge kind="private">Private</Badge> connected data · <Badge kind="note">Your note</Badge></p>
        <ol className="space-y-2">{items.map((i) => <li key={i.key} className="card-sm p-3">{i.node}</li>)}</ol>
        {!items.length && <p className="text-sm text-slate-500">Nothing yet.</p>}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Add a note</h2>
        <ApiForm url="/api/workspace" className="max-w-lg space-y-2" submit="Add note" fields={[{ name: "title", label: "Note", required: true }, { name: "summary", label: "Details", type: "textarea" }]} envelope={{ entity: "note", op: "insert", static: { vc_id: id } }} />
      </section>
    </main>
  );
}
