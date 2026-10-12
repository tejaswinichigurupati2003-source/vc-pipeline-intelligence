import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiForm, Badge } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/view/format";
import { loadBrief } from "@/lib/workspace/meeting";
import { followUpChecklist } from "@/lib/insights/brief";

export const dynamic = "force-dynamic";

export default async function MeetingBrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const out = await loadBrief(id);
  if (!out) notFound();
  const { brief, meeting, commitments, diligence } = out;
  const checklist = meeting.notes_confirmed
    ? followUpChecklist({ notes: meeting.notes ?? "", openCommitments: commitments.filter((c) => ["open", "proposed"].includes(c.status)).map((c) => c.text), diligence: diligence.filter((d) => d.status !== "provided").map((d) => d.request_text) })
    : null;

  return (
    <main className="max-w-3xl">
      <Link href="/workspace/timeline" className="text-sm">&larr; Timeline</Link>
      <h1 className="mt-2 text-2xl font-bold">{brief.heading}</h1>
      <p className="text-sm text-slate-500">{fmtDateTime(brief.when)}</p>

      <section className="mt-5"><h2 className="font-semibold">Investor thesis</h2><p className="text-sm">{brief.thesis}</p></section>

      <section className="mt-5">
        <h2 className="font-semibold">Fresh evidence <Badge kind="public">Public</Badge></h2>
        {brief.noEvidenceNote && <p className="text-sm text-slate-500">{brief.noEvidenceNote}</p>}
        <ul className="space-y-2">
          {brief.freshEvidence.map((s, i) => (
            <li key={i} className="card-sm p-3 text-sm">
              <a href={s.source_url} target="_blank" rel="noopener noreferrer">{s.title}</a>
              <div className="text-xs text-slate-500">{fmtDate(s.date)} · {s.signal_type.replace(/_/g, " ")} · {s.source_domain} · {s.label}</div>
              <p>{s.evidence_summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-5">
        <h2 className="font-semibold">Prior interactions <Badge kind="private">Private</Badge></h2>
        {!brief.priorInteractions.length && <p className="text-sm text-slate-500">None recorded.</p>}
        <ul className="text-sm">{brief.priorInteractions.map((p, i) => <li key={i}>{fmtDate(p.occurred_at)}: {p.link_url ? <a href={p.link_url} target="_blank" rel="noopener noreferrer">{p.title}</a> : p.title}{p.state && ` (${p.state.replace(/_/g, " ")})`}</li>)}</ul>
      </section>

      <section className="mt-5">
        <h2 className="font-semibold">Open commitments</h2>
        {!brief.openCommitments.length && <p className="text-sm text-slate-500">None.</p>}
        <ul className="text-sm">{brief.openCommitments.map((c, i) => <li key={i}>{c.who === "founder" ? "You" : "Investor"}: {c.text} (due {fmtDate(c.due_at)})</li>)}</ul>
      </section>

      <section className="mt-5">
        <h2 className="font-semibold">Suggested questions</h2>
        <ul className="list-disc pl-5 text-sm">{brief.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
      </section>

      <section className="mt-5">
        <h2 className="font-semibold">Company proof points <Badge kind="note">Approved claims only</Badge></h2>
        {!brief.proofPoints.length && <p className="text-sm text-slate-500">No approved claims yet. Add and approve them under Materials.</p>}
        <ul className="list-disc pl-5 text-sm">{brief.proofPoints.map((p, i) => <li key={i}><b>{p.title}:</b> {p.claim}</li>)}</ul>
        {brief.unapprovedMaterialsHidden > 0 && <p className="text-xs text-slate-500">{brief.unapprovedMaterialsHidden} unapproved item(s) hidden.</p>}
        {brief.openDiligence.length > 0 && <p className="mt-2 text-sm">Open diligence: {brief.openDiligence.map((d) => d.request_text).join("; ")}</p>}
      </section>

      <section className="mt-8 card p-4">
        <h2 className="font-semibold">After the meeting</h2>
        <ApiForm url="/api/workspace" className="mt-2 space-y-2" submit="Save notes"
          fields={[{ name: "notes", label: "Your meeting notes", type: "textarea", defaultValue: meeting.notes ?? "" }, { name: "notes_confirmed", label: "These notes are final (builds the follow-up checklist)", type: "checkbox", defaultValue: String(meeting.notes_confirmed) }]}
          envelope={{ entity: "meeting", op: "update", id }} />
        {checklist && (
          <div className="mt-4">
            <h3 className="text-sm font-medium">Follow-up checklist (draft)</h3>
            <ul className="list-disc pl-5 text-sm">{checklist.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <ApiForm url="/api/workspace" className="mt-2" submit="Mark follow-up done" fields={[]} envelope={{ entity: "meeting", op: "update", id, static: { followup_done: true } }} />
          </div>
        )}
      </section>
    </main>
  );
}
