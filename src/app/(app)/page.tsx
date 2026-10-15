import Link from "next/link";
import CountUp from "@/components/CountUp";
import { LiveInsights, SignalTicker } from "@/components/LiveBits";
import { buildLiveLines, buildTicker } from "@/lib/insights/live";
import { summarizePipeline } from "@/lib/insights/scan-summary";
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

function Stat({ label, value, hint, href }: { label: string; value: number; hint: string; href: string }) {
  return (
    <Link href={href} className="stat-link px-6 py-5 no-underline hover:no-underline" title={`See the ${value} investor${value === 1 ? "" : "s"}`}>
      <div className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/60">{label}</div>
      <div className="mt-2 font-display text-[2.1rem] font-semibold leading-none text-white"><CountUp value={value} /></div>
      <div className="mt-2 text-xs text-white/60">{hint}</div>
      <span className="go text-white/80"><Icon name="arrowUp" className="h-4 w-4 rotate-45" /></span>
    </Link>
  );
}

export default async function Today() {
  const [rows, states, settings, run, { data: commitments }, { data: meetings }, { data: fb }, { count: newSuggestions }] = await Promise.all([
    pipeline(), getStates(), getSettings(), latestRun(),
    db().from("commitments").select("id, vc_id, text, due_at, status, who"),
    db().from("calendar_events").select("id, vc_id, title, start_at, notes_confirmed, followup_done, included"),
    db().from("user_feedback").select("target_id, created_at").eq("target_type", "action").eq("verdict", "dismissed").order("created_at", { ascending: true }),
    db().from("investor_suggestions").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const dismissed = Object.fromEntries((fb ?? []).map((f) => [f.target_id, f.created_at]));

  const today = buildToday({
    now: new Date(),
    vcs: rows.map((r) => ({ ...r, top_signal_url: r.top_signal?.source_url ?? null })),
    commitments: commitments ?? [], meetings: meetings ?? [], states, dismissed,
    followUpAfterDays: Number(settings.follow_up_after_days) || 10,
  });
  const groups = groupByType(today.actions);
  const sum = summarizePipeline(rows, run);
  const count = (b: string) => rows.filter((r) => r.bucket === b).length;
  const hour = new Date().getHours();
  const greeting = settings.founder_name ? `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${settings.founder_name.split(" ")[0]}` : "Today";

  return (
    <>
      <section className="grad-cherry hero-shift hatch relative mb-8 overflow-hidden border border-slate-900">
        <div className="relative z-10 p-6 lg:p-8">
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/60">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="mt-2 !text-[1.9rem] !text-white">{greeting}</h1>
          <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-white/75">
            {today.total ? <>You have <b className="text-white">{today.total}</b> things worth doing{today.total > today.shown ? `; here are the top ${today.shown}` : ""}. Ranked by what matters most.</> : "Nothing needs your attention right now."}
          </p>
          <LiveInsights lines={buildLiveLines(rows, newSuggestions ?? 0)} />
        </div>
        <div className="relative z-10 grid grid-cols-2 divide-x divide-white/20 border-t border-white/20 xl:grid-cols-4">
          <Stat label="Ready to reach out" value={count("reach_out")} hint="Not contacted, signal 30+" href="/investors?filter=ready" />
          <Stat label="Awaiting reply" value={rows.filter((r) => r.contact_status === "waiting_for_response").length} hint="You've reached out" href="/investors?stage=waiting_for_response" />
          <Stat label="In conversation" value={rows.filter((r) => r.contact_status === "in_conversation").length} hint="Active discussions" href="/investors?stage=in_conversation" />
          <Stat label="Needs a refresh" value={count("stale")} hint="Last scan failed" href="/investors?filter=stale" />
        </div>
      </section>

      <SignalTicker items={buildTicker(rows)} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {!groups.length && (
            <div className="card grid place-items-center p-12 text-center">
              <span className="mb-3 grid h-12 w-12 place-items-center border border-slate-900 grad-cherry text-white"><Icon name="check" className="h-6 w-6" /></span>
              <h2>You&apos;re all caught up</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-500">Refresh to check for new investor news, or connect Gmail and Calendar to see replies and meetings here.</p>
            </div>
          )}
          {groups.map(([type, list]) => (
            <section key={type} className="card">
              <header className="flex items-center gap-2.5 border-b border-slate-900 bg-slate-50 px-4 py-3">
                <span className="grid h-7 w-7 place-items-center border border-slate-900 bg-white text-indigo-700"><Icon name={GROUP_ICON[type]} className="h-4 w-4" /></span>
                <h2>{ACTION_LABEL[type]}</h2>
                <span className="border border-slate-300 bg-white px-1.5 text-[0.72rem] font-bold leading-[1.2rem] text-slate-700">{list.length}</span>
              </header>
              <ul className="divide-y divide-slate-200">
                {list.map((a) => (
                  <li key={a.key} className="flex items-start gap-3.5 px-4 py-3.5 transition hover:bg-slate-50">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center font-display text-[0.72rem] font-bold" style={avatarStyle(a.firm)}>{initials(a.firm)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        {a.vcId ? <Link href={`/investors/${a.vcId}`} className="font-bold text-slate-900 no-underline hover:text-indigo-700 hover:no-underline">{a.firm}</Link> : <b>{a.firm}</b>}
                        <span className="text-[0.92rem] font-semibold text-slate-600">{a.what}</span>
                      </div>
                      <p className="mt-0.5 text-[0.85rem] leading-snug text-slate-500">{a.reason}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <Badge kind={a.provenance === "verified" ? "verified" : a.provenance === "inferred" ? "inferred" : "confirmed"}>
                          {a.provenance === "verified" ? "Verified" : a.provenance === "inferred" ? "Needs your OK" : "From your data"}
                        </Badge>
                        {a.sourceUrl && <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold"><Icon name="link" className="h-3.5 w-3.5" />Source</a>}
                        {a.vcId && (type === "reach_out" || type === "follow_up" || type === "respond") && <Link href={`/investors/${a.vcId}#draft`} className="inline-flex items-center gap-1 font-semibold"><Icon name="mail" className="h-3.5 w-3.5" />Open draft</Link>}
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

        <aside className="space-y-6">
          <section className="card">
            <h2 className="border-b border-slate-900 bg-slate-50 px-4 py-3">Latest scan</h2>
            <div className="p-4">
              {run ? (
                <>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.85rem]">
                  <dt>Status</dt><dd className="text-right font-semibold capitalize text-slate-800">{run.status}</dd>
                  <dt>When</dt><dd className="text-right text-slate-700">{timeAgo(run.finished_at ?? run.started_at)}</dd>
                  <dt title="Investors whose search finished. The rest hit a failed or incomplete search and keep their previous values; they are never shown as quiet.">Refreshed</dt>
                  <dd className="text-right text-slate-700">{run.vcs_succeeded} of {run.vcs_targeted}{sum.notRefreshed > 0 && <span className="block text-xs font-semibold text-amber-700">{sum.notRefreshed} search incomplete, old values kept</span>}</dd>
                  <dt title="Verified signals this scan stored that were not already on file. Not the total.">New this scan</dt><dd className="text-right text-slate-700">{run.signals_accepted}</dd>
                </dl>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <div className="eyebrow mb-2">Where your {sum.tracked} investors stand</div>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[0.85rem]">
                    <dt title="Investors with at least one verified source dated in the last 30 days. The score is built from these.">Verified news, last 30 days</dt><dd className="text-right text-slate-700">{sum.withNews} investors · {sum.sources} sources</dd>
                    <dt title="Not contacted yet, with a verified signal scoring 30 or more.">Ready to reach out</dt><dd className="text-right font-semibold text-slate-900">{sum.ready}</dd>
                    <dt title="A lighter verified signal (score 1 to 29): check fit before reaching out.">Worth a look</dt><dd className="text-right text-slate-700">{sum.worthLook}</dd>
                    <dt title="You are already waiting on a reply, so no outreach is suggested whatever the news.">On hold, awaiting reply</dt><dd className="text-right text-slate-700">{sum.hold}</dd>
                    <dt title="Search finished and found no verified signal. Not proof the investor is inactive.">Quiet</dt><dd className="text-right text-slate-700">{sum.quiet}</dd>
                    {sum.needsRefresh > 0 && <><dt title="The last search failed, so the old values are kept. Not the same as quiet.">Needs a refresh</dt><dd className="text-right font-semibold text-amber-700">{sum.needsRefresh}</dd></>}
                  </dl>
                </div>
                </>
              ) : <p className="text-sm text-slate-500">No scan yet. Press Refresh in the top bar.</p>}
            </div>
          </section>

          <section className="card">
            <h2 className="border-b border-slate-900 bg-slate-50 px-4 py-3">Skipped, and why</h2>
            <div className="p-4">
              <p className="mb-3 text-xs text-slate-500">Investors we left off, and why.</p>
              <ul className="scroll-thin max-h-[26rem] space-y-3 overflow-y-auto pr-1">
                {today.suppressed.slice(0, 14).map((s, i) => (
                  <li key={i} className="border-l-2 border-slate-300 pl-3 text-[0.82rem] leading-snug text-slate-600"><b className="text-slate-800">{s.firm || "Item"}</b><br />{s.reason}</li>
                ))}
                {!today.suppressed.length && <li className="text-sm text-slate-400">Nothing was skipped.</li>}
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
