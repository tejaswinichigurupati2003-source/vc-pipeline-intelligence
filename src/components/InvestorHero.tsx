import Link from "next/link";
import Icon from "@/components/shell/Icon";
import { fitScore } from "@/lib/insights/fit";
import type { PipelineRow } from "@/lib/db/read";
import { cleanSummary } from "@/lib/view/board";
import { fmtDate, STATUS_LABEL } from "@/lib/view/format";
import { avatarStyle, formatAction, initials, signalStrength, TONE_CLASS } from "@/lib/view/labels";

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 font-display text-[1.35rem] font-semibold leading-none text-slate-900">{children}</div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Header for an investor page. Pure presentation over a PipelineRow. */
export default function InvestorHero({ vc, backHref, backLabel }: { vc: PipelineRow; backHref: string; backLabel: string }) {
  const a = formatAction(vc.recommended_action, vc.bucket);
  const sg = signalStrength(vc.follow_up_score);
  const stale = vc.bucket === "stale";
  const fit = fitScore({ investment_thesis: vc.investment_thesis, sector_keywords: [], firm_name: vc.firm_name }).score;
  const s = cleanSummary(vc.signal_summary);
  const stageTone = vc.contact_status === "in_conversation" ? "go" : vc.contact_status === "waiting_for_response" ? "caution" : vc.contact_status === "closed" ? "muted" : "info";

  return (
    <div>
      <Link href={backHref} className="eyebrow mb-5 inline-flex items-center gap-1.5 no-underline hover:text-indigo-700 hover:no-underline"><Icon name="board" className="h-3.5 w-3.5" />{backLabel}</Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center font-display text-lg font-bold" style={avatarStyle(vc.firm_name)}>{initials(vc.firm_name)}</span>
        <div className="min-w-0">
          <h1>{vc.firm_name}</h1>
          <p className="mt-1 text-[0.95rem] text-slate-500">{vc.investor_name !== vc.firm_name ? `${vc.investor_name} · ` : ""}{vc.investment_thesis ?? "No thesis notes yet"}</p>
        </div>
        <span className={`ml-auto inline-flex items-center px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.08em] ${TONE_CLASS[stageTone].chip}`}>{STATUS_LABEL[vc.contact_status]}</span>
      </div>

      <div className="card mb-5 grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 sm:divide-x xl:grid-cols-4">
        <Stat label="Signal strength" sub={stale ? "Last scan failed" : "Verified, last 30 days"}>
          {stale ? <span className="text-rose-700">Stale</span> : <>{vc.follow_up_score ?? "–"} <span className={`ml-1 align-middle font-sans text-[0.72rem] font-bold uppercase tracking-wider ${sg.tone === "go" ? "text-emerald-700" : sg.tone === "caution" ? "text-amber-700" : "text-slate-400"}`}>{sg.label}</span></>}
        </Stat>
        <Stat label="Thesis fit" sub="Keyword match on your notes">{fit}<span className="font-sans text-sm font-medium text-slate-400"> / 100</span></Stat>
        <Stat label="Latest signal" sub={vc.top_signal ? vc.top_signal.source_domain : "None found yet"}>{fmtDate(vc.last_signal_date)}</Stat>
        <Stat label="Last good scan" sub={vc.latest_scan_mode === "rules_only" ? "Rules-only mode" : "Gemini-verified"}>{fmtDate(vc.last_success_at)}</Stat>
      </div>

      <div className="card relative mb-8 flex flex-wrap items-start gap-4 p-5 pl-6">
        <span className="absolute inset-y-0 left-0 w-1 grad-cherry" />
        <div className={`grid h-10 w-10 shrink-0 place-items-center ${TONE_CLASS[a.tone].chip}`}><Icon name={stale ? "alert" : a.tone === "go" ? "signal" : "clock"} /></div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Recommended next step</div>
          <div className="mt-1 font-display text-[1.05rem] font-semibold text-slate-900">{a.label}</div>
          <p className="text-[0.9rem] text-slate-500">{a.hint}.</p>
          {s.text && <p className="mt-2 text-[0.92rem] leading-relaxed text-slate-700"><span className="font-semibold text-slate-900">Why: </span>{s.text}</p>}
          {vc.recommended_action?.startsWith("SKIP") && <p className="mt-2 text-xs text-slate-400">Skipped because no qualifying public signal was found by our searches. That is not proof of inactivity.</p>}
          {vc.recommended_action?.startsWith("HOLD") && <p className="mt-2 text-xs text-slate-400">On hold because you are already waiting for their reply.</p>}
        </div>
      </div>
    </div>
  );
}
