import Link from "next/link";
import { ApiButton, Badge } from "@/components/ui";
import { db } from "@/lib/db/client";
import { ACTION_LABEL, buildToday, groupByType } from "@/lib/insights/today";
import { STATE_LABEL, type RelationshipState } from "@/lib/relationships/classify";
import { getSettings, getStates, pipeline } from "@/lib/workspace/data";
import { fmtDate } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function Today() {
  const [rows, states, settings] = await Promise.all([pipeline(), getStates(), getSettings()]);
  const { data: commitments } = await db().from("commitments").select("id, vc_id, text, due_at, status, who");
  const { data: meetings } = await db().from("calendar_events").select("id, vc_id, title, start_at, notes_confirmed, followup_done, included");
  const { data: fb } = await db().from("user_feedback").select("target_id, created_at").eq("target_type", "action").eq("verdict", "dismissed").order("created_at", { ascending: true });
  const dismissed = Object.fromEntries((fb ?? []).map((f) => [f.target_id, f.created_at]));

  const today = buildToday({
    now: new Date(),
    vcs: rows.map((r) => ({ ...r, top_signal_url: r.top_signal?.source_url ?? null })),
    commitments: commitments ?? [], meetings: meetings ?? [], states, dismissed,
    followUpAfterDays: Number(settings.follow_up_after_days) || 10,
  });
  const groups = groupByType(today.actions);

  return (
    <main>
      <h1 className="text-2xl font-bold">Today / this week</h1>
      <p className="mb-6 text-sm text-slate-600">
        {today.shown} of {today.total} possible actions, highest priority first. Every action says why, and where the evidence came from.
      </p>

      {!groups.length && <p className="rounded border bg-white p-4 text-sm">Nothing needs action right now. Run a refresh or connect Gmail/Calendar for relationship-driven actions.</p>}
      {groups.map(([type, list]) => (
        <section key={type} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{ACTION_LABEL[type]}</h2>
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.key} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {a.vcId ? <Link href={`/workspace/vc/${a.vcId}`}>{a.title}</Link> : a.title}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">Why: {a.reason}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge kind={a.provenance === "verified" ? "verified" : a.provenance === "inferred" ? "inferred" : "confirmed"}>
                        {a.provenance === "verified" ? "Verified public/connected evidence" : a.provenance === "inferred" ? "Inferred: confirm it" : "Your data"}
                      </Badge>
                      {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>}
                      {a.vcId && states[a.vcId] && <span>Relationship: {STATE_LABEL[states[a.vcId].state as RelationshipState]} · {fmtDate(states[a.vcId].at)}</span>}
                    </div>
                  </div>
                  <ApiButton url="/api/workspace" body={{ entity: "feedback", op: "insert", values: { vc_id: a.vcId, target_type: "action", target_id: a.key, verdict: "dismissed" } }} label="Dismiss 14d" tone="quiet" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <details className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium">Why these and not others? ({today.suppressed.length} suppressed)</summary>
        <ul className="mt-3 space-y-1 text-slate-600">
          {today.suppressed.map((s, i) => <li key={i}><b>{s.firm || "Item"}</b>: {s.reason}</li>)}
        </ul>
      </details>
    </main>
  );
}
