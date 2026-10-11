import Link from "next/link";
import { Badge } from "@/components/ui";
import { fitScore } from "@/lib/insights/fit";
import { STATE_LABEL, type RelationshipState } from "@/lib/relationships/classify";
import { bandOfScore } from "@/lib/view/buckets";
import { fmtDate, fmtDateTime, STATUS_LABEL } from "@/lib/view/format";
import { getStates, pipeline } from "@/lib/workspace/data";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ status?: string; band?: string; q?: string }> }) {
  const sp = await searchParams;
  const [rows, states] = await Promise.all([pipeline(), getStates()]);
  const { data: lastRun } = await db().from("signal_runs").select("started_at, status").order("started_at", { ascending: false }).limit(1).maybeSingle();
  const list = rows
    .filter((r) => (!sp.status || r.contact_status === sp.status) && (!sp.band || bandOfScore(r.follow_up_score) === sp.band) && (!sp.q || `${r.firm_name} ${r.investor_name}`.toLowerCase().includes(sp.q.toLowerCase())))
    .map((r) => ({ r, fit: fitScore({ investment_thesis: r.investment_thesis, sector_keywords: [], firm_name: r.firm_name }).score }));

  return (
    <main>
      <h1 className="text-2xl font-bold">Investor pipeline</h1>
      <p className="mb-3 text-sm text-slate-600">Last refresh: {lastRun ? `${fmtDateTime(lastRun.started_at)} (${lastRun.status})` : "never"}. &quot;Source freshness&quot; is the last SUCCESSFUL scan per investor; a failed scan is shown as stale, not quiet.</p>
      <form className="mb-3 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={sp.q} placeholder="Search" className="rounded border px-2 py-1" />
        <select name="status" defaultValue={sp.status ?? ""} className="rounded border px-2 py-1"><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="band" defaultValue={sp.band ?? ""} className="rounded border px-2 py-1"><option value="">All timing bands</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        <button className="rounded bg-slate-800 px-3 py-1 text-white">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-500">
            <tr><th className="p-2">Investor</th><th className="p-2">Fit</th><th className="p-2">Timing signal</th><th className="p-2">Relationship</th><th className="p-2">Next action</th><th className="p-2">Source freshness</th></tr>
          </thead>
          <tbody>
            {list.map(({ r, fit }) => {
              const st = states[r.id];
              return (
                <tr key={r.id} className="border-t align-top">
                  <td className="p-2"><Link href={`/workspace/vc/${r.id}`} className="font-medium">{r.firm_name}</Link>{r.investor_name !== r.firm_name && <div className="text-xs text-slate-500">{r.investor_name}</div>}</td>
                  <td className="p-2" title="Keyword fit from your thesis notes (see Round health for assumptions)">{fit}</td>
                  <td className="p-2">{r.follow_up_score ?? "–"} <span className="text-xs text-slate-500">{bandOfScore(r.follow_up_score)}</span>
                    <div className="text-xs text-slate-500">Last signal {fmtDate(r.last_signal_date)}</div></td>
                  <td className="p-2">{STATUS_LABEL[r.contact_status]}
                    {st && <div className="text-xs"><Badge kind={st.confirmed ? "confirmed" : "inferred"}>{STATE_LABEL[st.state as RelationshipState]}{st.confirmed ? "" : " (inferred)"}</Badge></div>}</td>
                  <td className="p-2 max-w-xs">{r.bucket === "stale" ? <Badge kind="warn">DATA STALE: refresh failed</Badge> : r.recommended_action ?? "Not scanned"}</td>
                  <td className="p-2 whitespace-nowrap text-xs">{fmtDate(r.last_success_at)}{r.latest_scan_mode === "rules_only" && <> <Badge kind="neutral">rules-only</Badge></>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
