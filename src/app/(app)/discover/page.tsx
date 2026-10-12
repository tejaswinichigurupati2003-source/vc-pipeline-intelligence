import Link from "next/link";
import { FindInvestorsButton, SuggestionActions } from "@/components/DiscoverControls";
import PageHeader from "@/components/shell/PageHeader";
import { getCompanyContext, isUsableContext } from "@/lib/company/context";
import { lastRuns, listSuggestions } from "@/lib/expansion/service";
import { fmtDate, fmtDateTime } from "@/lib/view/format";

export const dynamic = "force-dynamic";

const TYPE: Record<string, string> = { venture_capital: "Venture fund", accelerator: "Accelerator", corporate_venture: "Corporate venture", angel_network: "Angel network", family_office: "Family office" };
const TABS = [{ key: "new", label: "New" }, { key: "added", label: "Added" }, { key: "dismissed", label: "Dismissed" }] as const;

export default async function Discover({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const sp = await searchParams;
  const show = TABS.find((t) => t.key === sp.show)?.key ?? "new";
  const [ctx, all, runs] = await Promise.all([getCompanyContext(), listSuggestions(), lastRuns(1)]);
  const usable = isUsableContext(ctx);
  const rows = all.filter((s) => s.status === show);
  const count = (k: string) => all.filter((s) => s.status === k).length;
  const last = runs[0];

  return (
    <main>
      <PageHeader
        eyebrow="Grow your list"
        title="Discover investors"
        subtitle="New funds and angels that fit your company and aren't on your list yet. We check the web every Monday and only suggest investors we can back with a source. Nothing is added until you say so."
        actions={<FindInvestorsButton disabled={!usable} />}
      />

      {!usable && (
        <div className="mb-6 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Tell us what your company does so we know who to look for. <Link href="/data-room" className="font-semibold underline">Add company details in the Data room</Link>, or load the sample company to try it out.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex border border-slate-900">
          {TABS.map((t) => (
            <Link key={t.key} href={t.key === "new" ? "/discover" : `/discover?show=${t.key}`} className={`px-4 py-2 text-sm font-semibold no-underline hover:no-underline ${show === t.key ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>
              {t.label} <span className="opacity-70">{count(t.key)}</span>
            </Link>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {last ? (last.status === "failed" ? `Last search ${fmtDateTime(last.started_at)} didn't finish. We'll try again next Monday.` : last.status === "running" ? "A search is running now." : `Last searched ${fmtDateTime(last.started_at)}: ${last.pages} pages read.`) : "No search has run yet."}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          {show === "new" ? (usable ? "No new suggestions right now. Run a search or check back after the next weekly scan." : "Add your company details to get suggestions.") : `Nothing ${show} yet.`}
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((s) => (
            <li key={s.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg">{s.firm_name}</h2>
                    {s.investor_type && <span className="border border-slate-300 bg-slate-100 px-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-600">{TYPE[s.investor_type] ?? s.investor_type}</span>}
                    {s.times_seen > 1 && <span className="text-xs text-slate-500">Seen {s.times_seen} times</span>}
                  </div>
                  {s.why_fit && <p className="mt-1 text-sm text-slate-700">{s.why_fit}</p>}
                  {s.thesis_summary && <p className="mt-1 text-sm text-slate-500">{s.thesis_summary}</p>}
                  <p className="mt-1 text-xs text-slate-500">{[s.stage_focus, s.geography].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <div className="eyebrow">Fit</div>
                  <div className="font-display text-2xl font-bold text-indigo-800">{s.fit_score}<span className="text-sm text-slate-400">/100</span></div>
                </div>
              </div>
              <div className="space-y-2 p-4">
                {s.evidence.map((e) => (
                  <blockquote key={e.url} className="border-l-2 border-indigo-700 pl-3 text-sm">
                    <span className="text-slate-800">“{e.quote}”</span>
                    <div className="mt-0.5 text-xs text-slate-500"><a href={e.url} target="_blank" rel="noreferrer noopener">{e.domain}</a>{e.date ? ` · ${fmtDate(e.date)}` : ""}</div>
                  </blockquote>
                ))}
                <div className="pt-2"><SuggestionActions id={s.id} status={s.status} vcId={s.vc_id} /></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
