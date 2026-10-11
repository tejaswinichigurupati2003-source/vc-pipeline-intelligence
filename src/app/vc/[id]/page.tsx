import Link from "next/link";
import { notFound } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";
import MarkWrong from "@/components/MarkWrong";
import { getVcDetail } from "@/lib/db/read";
import { signalDate } from "@/lib/scoring/score";
import { fmtDate, fmtDateTime, STATUS_LABEL } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function VcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getVcDetail(id, false);
  if (!d) notFound();
  const { vc, score, rejected, runs } = d;
  const items = [...score.items].sort((a, b) => (signalDate(b.signal)?.getTime() ?? 0) - (signalDate(a.signal)?.getTime() ?? 0));

  return (
    <main>
      <Link href="/" className="text-sm">&larr; This week</Link>
      <h1 className="mt-2 text-2xl font-bold">{vc.firm_name}{vc.investor_name !== vc.firm_name && <span className="text-slate-500"> · {vc.investor_name}</span>}</h1>
      <p className="text-sm text-slate-600">{vc.investment_thesis}</p>

      <section className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm md:grid-cols-4">
        <div><div className="text-xs text-slate-500">Score</div><div className="text-xl font-bold">{vc.follow_up_score ?? "–"}</div></div>
        <div><div className="text-xs text-slate-500">Relationship</div>{STATUS_LABEL[vc.contact_status]}</div>
        <div><div className="text-xs text-slate-500">Last signal</div>{fmtDate(vc.last_signal_date)}</div>
        <div><div className="text-xs text-slate-500">Last good scan</div>{fmtDate(vc.last_success_at)}</div>
        <div className="md:col-span-4"><div className="text-xs text-slate-500">Recommended action</div>
          {vc.bucket === "stale" ? "DATA STALE: refresh failed, not the same as quiet" : vc.recommended_action ?? "Not scanned yet"}</div>
        <div className="md:col-span-4"><div className="text-xs text-slate-500">Summary</div>{vc.signal_summary ?? "–"}</div>
      </section>

      <h2 className="mt-8 text-lg font-semibold">Evidence timeline</h2>
      {!items.length && <p className="text-sm text-slate-500">No accepted signals on record. Not found by the system, which is not proof of inactivity.</p>}
      <ol className="mt-2 space-y-3">
        {items.map(({ signal: s, contribution, counted, note, ageDays }) => (
          <li key={s.id} className={`rounded-lg border bg-white p-4 ${counted ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="font-medium">{s.title}</a>
              <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">
                {counted ? `+${contribution.toFixed(1)} pts` : note ?? "not scored"}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {fmtDate(signalDate(s)?.toISOString())} ({Number.isFinite(ageDays) ? Math.round(ageDays) : "?"}d ago) · {s.signal_type.replace(/_/g, " ")} ·
              {" "}{s.source_domain} ({s.source_tier}) · {s.confidence} confidence · {s.evidence_basis.replace("_", " ")} · date: {s.date_basis ?? "n/a"}
            </div>
            <p className="mt-2 text-sm">{s.evidence_summary}</p>
            {s.evidence_quote && <blockquote className="mt-2 border-l-4 border-slate-300 pl-3 text-sm italic text-slate-600">“{s.evidence_quote}”</blockquote>}
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
              <span>relevance {s.relevance_score}</span>
              {s.verification_status === "accepted" && <MarkWrong vcId={vc.id} signalId={s.id} />}
              {s.verification_status === "rejected_by_user" && <span>Rejected by you</span>}
            </div>
          </li>
        ))}
      </ol>

      <h2 className="mt-8 text-lg font-semibold">Run history</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {runs.map((r) => (
          <li key={r.run_id + (r.finished_at ?? "")}>
            {fmtDateTime(r.finished_at)} · {r.status}{r.scan_mode === "rules_only" ? " · rules-only" : ""} · {r.signals_accepted} accepted
            {r.error_message && <span className="text-rose-700"> · {r.error_message.slice(0, 160)}</span>}
          </li>
        ))}
        {!runs.length && <li className="text-slate-500">No runs yet.</li>}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Rejected candidates</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {rejected.map((r, i) => (
          <li key={i} className="text-slate-600">
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.outcome}</span>{" "}
            <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title ?? r.url}</a>
            {r.reason && <span className="text-xs text-slate-500"> · {r.reason}</span>}
          </li>
        ))}
        {!rejected.length && <li className="text-slate-500">None recorded.</li>}
      </ul>

      <AdminPanel vcId={vc.id} />
    </main>
  );
}
