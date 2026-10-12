import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import { ApiButton, ApiForm, Badge } from "@/components/ui";
import { db } from "@/lib/db/client";
import { RELATIONSHIP_STATES, STATE_LABEL } from "@/lib/relationships/classify";
import { fmtDate, fmtDateTime } from "@/lib/view/format";

export const dynamic = "force-dynamic";

const stateOptions = RELATIONSHIP_STATES.map((s) => ({ value: s, label: STATE_LABEL[s] }));

export default async function Timeline() {
  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_name").order("firm_name");
  const name = new Map((vcs ?? []).map((v) => [v.id, v.firm_name]));
  const vcOptions = (vcs ?? []).map((v) => ({ value: v.id, label: v.firm_name }));
  const { data: events } = await db().from("relationship_events").select("*").order("occurred_at", { ascending: false }).limit(150);
  const { data: commitments } = await db().from("commitments").select("*").in("status", ["proposed", "open"]).order("due_at", { ascending: true });
  const { data: meetings } = await db().from("calendar_events").select("*").gte("start_at", new Date(Date.now() - 14 * 86_400_000).toISOString()).order("start_at", { ascending: true });
  const unmatched = (events ?? []).filter((e) => !e.vc_id);

  return (
    <main>
      <PageHeader title="Conversations" subtitle={<>Meetings, selected email threads, commitments and your own notes. <Badge kind="private">Private connected data</Badge> <Badge kind="note">Your note</Badge> are kept visually separate from public evidence.</>} />

      {unmatched.length > 0 && (
        <section className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold">Unmatched threads ({unmatched.length})</h2>
          <p className="mb-2 text-xs text-slate-600">We could not tell which investor these belong to. Assign them (this also teaches future matching) or leave them.</p>
          <ul className="space-y-2">
            {unmatched.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 text-sm">
                <a href={e.link_url ?? "#"} target="_blank" rel="noopener noreferrer">{e.title}</a>
                <span className="text-xs text-slate-500">{(e.participants as string[]).slice(0, 2).join(", ")}</span>
                <ApiForm url="/api/relationships/assign" className="flex items-center gap-2" fields={[{ name: "vc_id", label: "", type: "select", options: vcOptions, required: true }]} extra={{ event_id: e.id }} submit="Assign" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Open commitments</h2>
        {!commitments?.length && <p className="text-sm text-slate-500">None. Commitments proposed from emails appear here for you to confirm.</p>}
        <ul className="space-y-2">
          {(commitments ?? []).map((c) => (
            <li key={c.id} className="card-sm p-3 text-sm">
              <div>{c.text}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{name.get(c.vc_id) ?? "Unassigned"} · due {fmtDate(c.due_at)} · {c.who === "founder" ? "you owe" : "investor owes"}</span>
                {c.status === "proposed" ? <Badge kind="inferred">Proposed from email: confirm</Badge> : <Badge kind="confirmed">Confirmed</Badge>}
                {c.status === "proposed" && <ApiButton url="/api/workspace" body={{ entity: "commitment", op: "update", id: c.id, values: { status: "open" } }} label="Confirm" />}
                <ApiButton url="/api/workspace" body={{ entity: "commitment", op: "update", id: c.id, values: { status: "done" } }} label="Done" />
                <ApiButton url="/api/workspace" body={{ entity: "commitment", op: "update", id: c.id, values: { status: "dismissed" } }} label="Not a commitment" tone="quiet" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Meetings (investor guests only)</h2>
        {!meetings?.length && <p className="text-sm text-slate-500">No investor meetings synced. Connect Calendar under Integrations.</p>}
        <ul className="space-y-2">
          {(meetings ?? []).map((m) => (
            <li key={m.id} className={`card-sm p-3 text-sm ${m.included ? "" : "opacity-50"}`}>
              <div className="flex flex-wrap items-center gap-2"><Badge kind="private">Calendar</Badge><b>{m.title}</b> with {name.get(m.vc_id) ?? "?"} · {fmtDateTime(m.start_at)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link href={`/meetings/${m.id}`} className="text-xs">Brief & follow-up</Link>
                <ApiButton url="/api/workspace" body={{ entity: "meeting", op: "update", id: m.id, values: { included: !m.included } }} label={m.included ? "Exclude this event" : "Include again"} tone="quiet" />
                <ApiButton url="/api/workspace" body={{ entity: "meeting", op: "delete", id: m.id }} label="Delete" tone="danger" confirm="Delete this meeting record?" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Add a note</h2>
        <ApiForm url="/api/workspace" className="max-w-lg space-y-2" submit="Add note"
          fields={[{ name: "vc_id", label: "Investor", type: "select", options: vcOptions, required: true }, { name: "title", label: "Note", type: "text", required: true }, { name: "summary", label: "Details (optional)", type: "textarea" }, { name: "state", label: "Relationship state (optional)", type: "select", options: stateOptions }]}
          envelope={{ entity: "note", op: "insert" }} />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">All interactions</h2>
        <ul className="space-y-2">
          {(events ?? []).filter((e) => e.vc_id).map((e) => (
            <li key={e.id} className="card-sm p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {e.provenance === "user" ? <Badge kind="note">Your note</Badge> : <Badge kind="private">{e.provenance === "gmail" ? "Gmail (selected label)" : "Calendar"}</Badge>}
                <Link href={`/investors/${e.vc_id}`}>{name.get(e.vc_id)}</Link>
                <span className="text-xs text-slate-500">{fmtDateTime(e.occurred_at)}</span>
                {e.state && <Badge kind={e.state_confidence === "user_confirmed" ? "confirmed" : "inferred"}>{STATE_LABEL[e.state as keyof typeof STATE_LABEL]}{e.state_confidence === "user_confirmed" ? "" : " (inferred)"}</Badge>}
              </div>
              <div className="mt-1">{e.link_url ? <a href={e.link_url} target="_blank" rel="noopener noreferrer">{e.title}</a> : e.title}</div>
              {e.summary && <div className="text-xs text-slate-500">{e.summary}</div>}
              {e.provenance === "gmail" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <ApiForm url="/api/workspace" className="flex items-center gap-2" fields={[{ name: "state", label: "", type: "select", options: stateOptions, required: true, defaultValue: e.state ?? "" }]} envelope={{ entity: "note", op: "update", id: e.id }} submit="Confirm / correct state" />
                  <ApiForm url="/api/relationships/assign" className="flex items-center gap-2" fields={[{ name: "vc_id", label: "", type: "select", options: vcOptions, required: true }]} extra={{ event_id: e.id }} submit="Wrong investor? Reassign" />
                  <ApiButton url="/api/workspace" body={{ entity: "note", op: "delete", id: e.id }} label="Delete" tone="danger" confirm="Delete this record from the app? (Your Gmail thread is untouched.)" />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
