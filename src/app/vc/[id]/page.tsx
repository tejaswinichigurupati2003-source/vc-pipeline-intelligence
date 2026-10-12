import { notFound } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";
import EvidenceCard from "@/components/EvidenceCard";
import InvestorHero from "@/components/InvestorHero";
import MarkWrong from "@/components/MarkWrong";
import AppShell from "@/components/shell/AppShell";
import { workspaceOpen } from "@/lib/auth";
import { getVcDetail } from "@/lib/db/read";
import { signalDate } from "@/lib/scoring/score";
import { fmtDateTime } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function VcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getVcDetail(id, false);
  if (!d) notFound();
  const { vc, score, rejected, runs } = d;
  const items = [...score.items].sort((a, b) => (signalDate(b.signal)?.getTime() ?? 0) - (signalDate(a.signal)?.getTime() ?? 0));

  return (
    <AppShell mode="public">
      <main className="max-w-4xl">
        <InvestorHero vc={vc} backHref="/" backLabel="All investors" />

        <h2 className="mb-3">Evidence</h2>
        {!items.length && <p className="card p-5 text-sm text-slate-500">No verified signals on record. That means our searches found nothing qualifying, not that the investor is inactive.</p>}
        <ol className="space-y-3">
          {items.map((it) => (
            <EvidenceCard key={it.signal.id} item={it}
              action={it.signal.verification_status === "accepted" ? <MarkWrong vcId={vc.id} signalId={it.signal.id} open={workspaceOpen()} /> : it.signal.verification_status === "rejected_by_user" ? <span>Marked wrong</span> : null} />
          ))}
        </ol>

        <h2 className="mb-3 mt-10">Scan history</h2>
        <ul className="card divide-y divide-slate-100 text-[0.88rem]">
          {runs.map((r) => (
            <li key={r.run_id + (r.finished_at ?? "")} className="flex flex-wrap items-center gap-x-3 px-4 py-2.5 text-slate-600">
              <span className="font-semibold text-slate-800">{fmtDateTime(r.finished_at)}</span>
              <span className="capitalize">{r.status.replace(/_/g, " ")}</span>
              {r.scan_mode === "rules_only" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">rules-only</span>}
              <span>{r.signals_accepted} accepted</span>
              {r.error_message && <span className="text-rose-600">{r.error_message.slice(0, 120)}</span>}
            </li>
          ))}
          {!runs.length && <li className="px-4 py-3 text-slate-400">No scans yet.</li>}
        </ul>

        <details className="card mt-8 p-4">
          <summary className="cursor-pointer font-bold text-slate-900">Candidates we rejected ({rejected.length})</summary>
          <ul className="mt-3 space-y-2 text-[0.86rem]">
            {rejected.map((r, i) => (
              <li key={i} className="text-slate-600">
                <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-bold text-slate-600">{r.outcome.replace(/_/g, " ")}</span>
                <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title ?? r.url}</a>
                {r.reason && <span className="text-xs text-slate-400"> · {r.reason}</span>}
              </li>
            ))}
            {!rejected.length && <li className="text-slate-400">None recorded.</li>}
          </ul>
        </details>

        <AdminPanel vcId={vc.id} open={workspaceOpen()} />
      </main>
    </AppShell>
  );
}
