import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Icon, { type IconName } from "@/components/shell/Icon";
import { ApiButton, Badge } from "@/components/ui";
import { db } from "@/lib/db/client";
import { latestRun } from "@/lib/db/store";
import { ACTION_LABEL, buildToday, groupByType, type ActionType } from "@/lib/insights/today";
import { STATE_LABEL, type RelationshipState } from "@/lib/relationships/classify";
import { avatarStyle, initials, timeAgo } from "@/lib/view/labels";
import { getSettings, getStates, pipeline } from "@/lib/workspace/data";

export const dynamic = "force-dynamic";

const GROUP_ICON: Record<ActionType, IconName> = {
  respond: "chat", commitment_due: "check", post_meeting: "clock", meeting_prep: "today", reach_out: "signal", follow_up: "refresh",
};

function Stat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: "emerald" | "amber" | "indigo" | "rose" }) {
  const dot = { emerald: "bg-emerald-500", amber: "bg-amber-500", indigo: "bg-indigo-500", rose: "bg-rose-500" }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[0.78rem] font-semibold text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}</div>
      <div className="mt-1.5 text-[1.9rem] font-extrabold leading-none tracking-tight text-slate-900">{value}</div>
      <div className="mt-1.5 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

export default async function Today() {
  const [rows, states, settings, run] = await Promise.all([pipeline(), getStates(), getSettings(), latestRun()]);
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
  const count = (b: string) => rows.filter((r) => r.bucket === b).length;
  const greeting = settings.founder_name ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${settings.founder_name.split(" ")[0]}` : "Today";

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        title={greeting}
        subtitle={today.total ? <>You have <b className="text-slate-800">{today.total}</b> things worth doing{today.total > today.shown ? `; here are the top ${today.shown}` : ""}. Each one says why, and where the evidence came from.</> : "Nothing needs your attention right now."}
      />

      <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ready to reach out" value={count("reach_out")} hint="Not contacted, fresh strong signal" tone="emerald" />
        <Stat label="Awaiting reply" value={rows.filter((r) => r.contact_status === "waiting_for_response").length} hint="You've reached out" tone="amber" />
        <Stat label="In conversation" value={rows.filter((r) => r.contact_status === "in_conversation").length} hint="Active discussions" tone="indigo" />
        <Stat label="Needs a refresh" value={count("stale")} hint="Last scan failed, not the same as quiet" tone="rose" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {!groups.length && (
            <div className="card grid place-items-center p-12 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Icon name="check" className="h-6 w-6" /></span>
              <h2>You&apos;re all caught up</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Refresh to look for new investor signals, or connect Gmail and Calendar so replies and meetings show up here.</p>
            </div>
          )}
          {groups.map(([type, list]) => (
            <section key={type} className="card overflow-hidden">
              <header className="flex items-center gap-2.5 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Icon name={GROUP_ICON[type]} className="h-4 w-4" /></span>
                <h2>{ACTION_LABEL[type]}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-[0.72rem] font-bold text-slate-500 ring-1 ring-inset ring-slate-200">{list.length}</span>
              </header>
              <ul className="divide-y divide-slate-100">
                {list.map((a) => (
                  <li key={a.key} className="flex items-start gap-3.5 px-4 py-3.5">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[0.8rem] font-extrabold" style={avatarStyle(a.firm)}>{initials(a.firm)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        {a.vcId ? <Link href={`/workspace/vc/${a.vcId}`} className="font-bold text-slate-900 no-underline hover:text-indigo-700 hover:no-underline">{a.firm}</Link> : <b>{a.firm}</b>}
                        <span className="text-[0.92rem] font-semibold text-slate-700">{a.what}</span>
                      </div>
                      <p className="mt-0.5 text-[0.85rem] leading-snug text-slate-500">{a.reason}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge kind={a.provenance === "verified" ? "verified" : a.provenance === "inferred" ? "inferred" : "confirmed"}>
                          {a.provenance === "verified" ? "Verified evidence" : a.provenance === "inferred" ? "Inferred: confirm it" : "From your data"}
                        </Badge>
                        {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold"><Icon name="link" className="h-3.5 w-3.5" />Source</a>}
                        {a.vcId && states[a.vcId] && <span>{STATE_LABEL[states[a.vcId].state as RelationshipState]} · {timeAgo(states[a.vcId].at)}</span>}
                      </div>
                    </div>
                    <ApiButton url="/api/workspace" body={{ entity: "feedback", op: "insert", values: { vc_id: a.vcId, target_type: "action", target_id: a.key, verdict: "dismissed" } }} label="Dismiss" tone="quiet" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="space-y-5">
          <section className="card p-4">
            <h2 className="mb-1">Latest scan</h2>
            {run ? (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.85rem]">
                <dt>Status</dt><dd className="text-right font-semibold capitalize text-slate-800">{run.status}</dd>
                <dt>When</dt><dd className="text-right text-slate-700">{timeAgo(run.finished_at ?? run.started_at)}</dd>
                <dt>Investors</dt><dd className="text-right text-slate-700">{run.vcs_succeeded} of {run.vcs_targeted} refreshed</dd>
                <dt>Signals found</dt><dd className="text-right text-slate-700">{run.signals_accepted}</dd>
                <dt>Gemini calls</dt><dd className="text-right text-slate-700">{run.llm_calls}</dd>
              </dl>
            ) : <p className="text-sm text-slate-500">No scan yet. Press Refresh in the top bar.</p>}
            <p className="mt-3 text-xs leading-relaxed text-slate-400">Quiet means nothing qualifying was found in the sources we search; it is not proof an investor is inactive.</p>
          </section>

          <section className="card p-4">
            <h2>Skipped, and why</h2>
            <p className="mb-2 text-xs text-slate-500">So you can trust what is not on your list.</p>
            <ul className="scroll-thin max-h-[26rem] space-y-2.5 overflow-y-auto pr-1">
              {today.suppressed.slice(0, 14).map((s, i) => (
                <li key={i} className="text-[0.82rem] leading-snug text-slate-600"><b className="text-slate-800">{s.firm || "Item"}</b><br />{s.reason}</li>
              ))}
              {!today.suppressed.length && <li className="text-sm text-slate-400">Nothing was skipped.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
