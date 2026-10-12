import { ApiButton, ApiForm } from "@/components/ui";
import Icon from "@/components/shell/Icon";
import { explainSources, scoreHeadline, type SourceExplain } from "@/lib/insights/explain";
import type { ScoreResult } from "@/lib/scoring/score";
import type { PersonRow } from "@/lib/people/store";
import type { HistoryPoint } from "@/lib/signals/history";
import { computeTrend, MOMENTUM_LABEL } from "@/lib/signals/timeseries";
import type { StoredSignal } from "@/lib/types";
import { fmtDate } from "@/lib/view/format";
import { ActivityBars, ScoreLine } from "./Sparkline";

const MOMENTUM_TONE: Record<string, string> = {
  rising: "border-emerald-300 bg-emerald-50 text-emerald-800", new: "border-emerald-300 bg-emerald-50 text-emerald-800",
  steady: "border-slate-300 bg-slate-100 text-slate-600", cooling: "border-amber-300 bg-amber-50 text-amber-900", none: "border-slate-300 bg-slate-100 text-slate-500",
};

const SOURCE_LABEL: Record<string, string> = { investor_row: "From your list", signal: "Found in a source", manual: "Added by you" };

function Source({ s, vcId }: { s: SourceExplain; vcId: string }) {
  return (
    <li className={`card p-4 ${s.counted ? "" : "border-dashed bg-slate-50/60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <a href={s.url} target="_blank" rel="noopener noreferrer" className="max-w-2xl text-[0.98rem] font-bold leading-snug text-slate-900 no-underline hover:text-indigo-700 hover:no-underline">{s.title}</a>
        <span className={`shrink-0 border px-2 py-0.5 text-[0.72rem] font-bold uppercase tracking-wider ${s.counted ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-300 bg-slate-100 text-slate-500"}`}>{s.counted ? `+${s.points} pts` : "Not scored"}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Icon name="clock" className="h-3.5 w-3.5" />{fmtDate(s.date)}{s.ageDays !== null ? ` · ${Math.round(s.ageDays)}d ago` : ""}</span>
        <span className="border border-slate-300 bg-slate-100 px-1.5 py-[1px] font-bold uppercase tracking-wider text-slate-600">{s.typeLabel}</span>
        <span>{s.domain}</span>
        {s.person && <span className="font-semibold text-indigo-800">via {s.person.name}{s.person.role ? `, ${s.person.role}` : ""}</span>}
      </div>
      <p className="mt-2.5 text-[0.9rem] leading-relaxed text-slate-700">{s.summary}</p>
      {s.quote && <blockquote className="mt-2.5 border-l-2 border-indigo-600 pl-3 text-[0.86rem] italic leading-relaxed text-slate-500">“{s.quote}”</blockquote>}

      {s.formula && <p className="mt-3 border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[0.76rem] text-slate-700">{s.formula}</p>}
      {s.skipReason && <p className="mt-3 text-xs font-semibold text-slate-500">{s.skipReason}</p>}

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-semibold text-slate-600">How we verified this</summary>
        <ul className="mt-2 space-y-1">
          {s.checks.map((c, i) => <li key={i} className="flex items-start gap-2 text-slate-600"><span className={`mt-[1px] ${c.ok ? "text-emerald-700" : "text-amber-700"}`}><Icon name={c.ok ? "check" : "alert"} className="h-3.5 w-3.5" /></span>{c.text}</li>)}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <a href={s.url} target="_blank" rel="noopener noreferrer">Open the source</a>
          {s.quote && <a href={`https://www.google.com/search?q=${encodeURIComponent(`"${s.quote}"`)}`} target="_blank" rel="noopener noreferrer">Search the exact quote</a>}
          {s.status === "accepted" && <ApiButton url={`/api/vc/${vcId}`} method="PATCH" body={{ signal_id: s.id }} label="This signal is wrong" tone="danger" />}
        </div>
      </details>
    </li>
  );
}

/** Everything behind the number: the sources, the arithmetic, the trend, and the people involved. */
export default function WhyScore({ vcId, firm, score, signals, history, people, now }: {
  vcId: string; firm: string; score: ScoreResult; signals: StoredSignal[]; history: HistoryPoint[]; people: PersonRow[]; now: Date;
}) {
  const sources = explainSources(score);
  const counted = sources.filter((s) => s.counted);
  const other = sources.filter((s) => !s.counted && s.status !== "superseded");
  const trend = computeTrend(signals, now);

  return (
    <section id="why" className="mb-8 scroll-mt-6">
      <h2 className="mb-1">Why this score</h2>
      <p className="mb-4 text-[0.9rem] text-slate-500">{scoreHeadline(score)} Every point below links to a public source you can open and check.</p>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="eyebrow">Activity over 6 months</div>
            <span className={`border px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider ${MOMENTUM_TONE[trend.momentum]}`}>{MOMENTUM_LABEL[trend.momentum]}</span>
          </div>
          <div className="mt-2"><ActivityBars weeks={trend.weeks} /></div>
          <p className="mt-1 text-[0.85rem] text-slate-700">{trend.explanation}</p>
          {trend.cadenceNote && <p className="mt-1 text-[0.85rem] text-slate-500">{trend.cadenceNote}</p>}
        </div>
        <div className="card p-4">
          <div className="eyebrow">Score after each scan</div>
          <div className="mt-2"><ScoreLine points={history} /></div>
          <p className="mt-1 text-xs text-slate-500">Trend is based on verified events from the last 180 days. It explains the score; it does not change it.</p>
        </div>
      </div>

      <div className="card mb-5">
        <h3 className="border-b border-slate-900 bg-slate-50 px-4 py-3 font-display text-sm font-semibold uppercase tracking-wider">People at {firm}</h3>
        <div className="p-4">
          <p className="mb-3 text-[0.85rem] text-slate-500">We also look for news about these people, and show when a source is about one of them. Names found in sources come with the sentence that links them to the firm.</p>
          {people.length > 0 ? (
            <ul className="mb-4 divide-y divide-slate-200 border border-slate-300">
              {people.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-[0.9rem]">
                  <span><b className="text-slate-900">{p.name}</b>{p.role ? <span className="text-slate-500"> · {p.role}</span> : null}
                    <span className="ml-2 text-xs text-slate-400">{SOURCE_LABEL[p.source]}</span>
                    {p.source_quote && <span className="mt-0.5 block text-xs italic text-slate-500">“{p.source_quote}”{p.source_url ? <> <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="not-italic">source</a></> : null}</span>}
                  </span>
                  <ApiButton url="/api/people" body={{ action: "remove", id: p.id }} label="Remove" tone="quiet" />
                </li>
              ))}
            </ul>
          ) : <p className="mb-4 text-sm text-slate-400">No people on record yet. They appear after the next scan, or add one.</p>}
          <ApiForm url="/api/people" className="grid max-w-xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" submit="Add person"
            fields={[{ name: "name", label: "Full name", required: true }, { name: "role", label: "Role (optional)", placeholder: "Partner" }]} extra={{ action: "add", vc_id: vcId }} />
        </div>
      </div>

      <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wider">Counted sources <span className="text-slate-400">{counted.length}</span></h3>
      {counted.length ? <ul className="space-y-3">{counted.map((s) => <Source key={s.id} s={s} vcId={vcId} />)}</ul> : <p className="text-sm text-slate-500">No verified source in the last 30 days.</p>}

      {other.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">Also found, not scored ({other.length})</summary>
          <ul className="mt-3 space-y-3">{other.map((s) => <Source key={s.id} s={s} vcId={vcId} />)}</ul>
        </details>
      )}
    </section>
  );
}
