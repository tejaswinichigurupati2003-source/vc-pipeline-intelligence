import Icon from "@/components/shell/Icon";
import { signalDate, type ScoredSignal } from "@/lib/scoring/score";
import { fmtDate } from "@/lib/view/format";

const TYPE_LABEL: Record<string, string> = {
  investor_thesis: "Thesis", portfolio_investment: "Investment", investor_commentary: "Commentary", event_appearance: "Appearance",
  fund_activity: "Fund news", portfolio_activity: "Portfolio news", other: "Other",
};

/** One piece of verified public evidence. Shows exactly what counted toward the score and why. */
export default function EvidenceCard({ item, action }: { item: ScoredSignal; action?: React.ReactNode }) {
  const { signal: s, contribution, counted, note, ageDays } = item;
  const when = signalDate(s)?.toISOString();
  const ago = Number.isFinite(ageDays) ? `${Math.round(ageDays)}d ago` : "date unknown";
  return (
    <li className={`card p-4 ${counted ? "" : "border-dashed opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="max-w-2xl text-[0.98rem] font-bold leading-snug text-slate-900 no-underline hover:text-indigo-700 hover:no-underline">{s.title}</a>
        <span className={`shrink-0 border px-2 py-0.5 text-[0.72rem] font-bold uppercase tracking-wider ${counted ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-300 bg-slate-100 text-slate-500"}`}>
          {counted ? `+${contribution.toFixed(1)} pts` : note ?? "not scored"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Icon name="clock" className="h-3.5 w-3.5" />{fmtDate(when)} · {ago}</span>
        <span className="border border-slate-300 bg-slate-100 px-1.5 py-[1px] font-bold uppercase tracking-wider text-slate-600">{TYPE_LABEL[s.signal_type] ?? s.signal_type}</span>
        <span>{s.source_domain} · {s.source_tier}</span>
        <span>{s.confidence} confidence</span>
        {s.evidence_basis === "headline_only" && <span className="font-semibold text-amber-700">headline only</span>}
      </div>
      <p className="mt-2.5 text-[0.9rem] leading-relaxed text-slate-700">{s.evidence_summary}</p>
      {s.evidence_quote && <blockquote className="mt-2.5 border-l-2 border-indigo-600 pl-3 text-[0.86rem] italic leading-relaxed text-slate-500">“{s.evidence_quote}”</blockquote>}
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
        <span>Relevance {s.relevance_score}</span>
        {action}
      </div>
    </li>
  );
}
