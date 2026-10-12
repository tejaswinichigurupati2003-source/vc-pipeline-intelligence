import Link from "next/link";
import Icon from "@/components/shell/Icon";
import { fitScore } from "@/lib/insights/fit";
import type { PipelineRow } from "@/lib/db/read";
import { cleanSummary } from "@/lib/view/board";
import { fmtDate, STATUS_LABEL } from "@/lib/view/format";
import { avatarStyle, formatAction, initials, signalStrength, TONE_CLASS } from "@/lib/view/labels";

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 text-[1.45rem] font-extrabold leading-none tracking-tight text-slate-900">{children}</div>
      {sub && <div className="mt-1.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Shared header for the public and workspace investor pages. Pure presentation over a PipelineRow. */
export default function InvestorHero({ vc, backHref, backLabel }: { vc: PipelineRow; backHref: string; backLabel: string }) {
  const a = formatAction(vc.recommended_action, vc.bucket);
  const sg = signalStrength(vc.follow_up_score);
  const stale = vc.bucket === "stale";
  const fit = fitScore({ investment_thesis: vc.investment_thesis, sector_keywords: [], firm_name: vc.firm_name }).score;
  const s = cleanSummary(vc.signal_summary);

  return (
    <div>
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 no-underline hover:text-indigo-700 hover:no-underline">
        <Icon name="board" className="h-4 w-4" />{backLabel}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-2xl text-xl font-extrabold" style={avatarStyle(vc.firm_name)}>{initials(vc.firm_name)}</span>
        <div className="min-w-0">
          <h1>{vc.firm_name}</h1>
          <p className="text-[0.95rem] text-slate-500">{vc.investor_name !== vc.firm_name ? `${vc.investor_name} · ` : ""}{vc.investment_thesis ?? "No thesis notes yet"}</p>
        </div>
        <span className={`ml-auto inline-flex items-center rounded-full px-3 py-1 text-[0.78rem] font-bold ring-1 ring-inset ${TONE_CLASS[vc.contact_status === "in_conversation" ? "go" : vc.contact_status === "waiting_for_response" ? "caution" : vc.contact_status === "closed" ? "muted" : "info"].chip}`}>{STATUS_LABEL[vc.contact_status]}</span>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Signal strength" sub={stale ? "Last scan failed" : "Verified evidence, last 30 days"}>
          {stale ? <span className="text-rose-600">Stale</span> : <>{vc.follow_up_score ?? "–"} <span className={`ml-1 align-middle text-[0.8rem] font-bold ${sg.tone === "go" ? "text-emerald-600" : sg.tone === "caution" ? "text-amber-600" : "text-slate-400"}`}>{sg.label}</span></>}
        </Stat>
        <Stat label="Thesis fit" sub="Keyword match on your notes">{fit}<span className="text-base font-semibold text-slate-400"> / 100</span></Stat>
        <Stat label="Latest signal" sub={vc.top_signal ? vc.top_signal.source_domain : "None found yet"}>{fmtDate(vc.last_signal_date)}</Stat>
        <Stat label="Last good scan" sub={vc.latest_scan_mode === "rules_only" ? "Rules-only mode" : "Gemini-verified"}>{fmtDate(vc.last_success_at)}</Stat>
      </div>

      <div className="card mb-8 flex flex-wrap items-start gap-4 p-5">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${TONE_CLASS[a.tone].chip}`}><Icon name={stale ? "alert" : a.tone === "go" ? "signal" : "clock"} /></div>
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Recommended next step</div>
          <div className="mt-0.5 text-[1.1rem] font-extrabold tracking-tight text-slate-900">{a.label}</div>
          <p className="text-[0.9rem] text-slate-500">{a.hint}.</p>
          {s.text && <p className="mt-2 text-[0.92rem] leading-relaxed text-slate-700"><span className="font-semibold text-slate-900">Why: </span>{s.text}</p>}
          {vc.recommended_action?.startsWith("SKIP") && <p className="mt-2 text-xs text-slate-400">Skipped because no qualifying public signal was found by our searches. That is not proof of inactivity.</p>}
          {vc.recommended_action?.startsWith("HOLD") && <p className="mt-2 text-xs text-slate-400">On hold because you are already waiting for their reply.</p>}
        </div>
      </div>
    </div>
  );
}
