import PageHeader from "@/components/shell/PageHeader";
import SettingsForm from "@/components/SettingsForm";
import { FIT_ASSUMPTIONS, fitScore } from "@/lib/insights/fit";
import { DEFAULT_TARGET, ROUND_ASSUMPTIONS, roundHealth } from "@/lib/insights/round-health";
import { STATUS_LABEL } from "@/lib/view/format";
import { getSettings, pipeline } from "@/lib/workspace/data";

export const dynamic = "force-dynamic";

export default async function Round() {
  const [rows, s] = await Promise.all([pipeline(), getSettings()]);
  const target = {
    investorsToContact: Number(s.round_target_investors) || DEFAULT_TARGET.investorsToContact,
    conversationsNeeded: Number(s.round_target_conversations) || DEFAULT_TARGET.conversationsNeeded,
  };
  const h = roundHealth({ target, vcs: rows.map((r) => ({ contact_status: r.contact_status, follow_up_score: r.follow_up_score, bucket: r.bucket, fit: fitScore({ investment_thesis: r.investment_thesis, sector_keywords: [], firm_name: r.firm_name }).score })) });
  const bar = (n: number) => <div className="h-2 rounded bg-slate-200"><div className="h-2 rounded bg-indigo-500" style={{ width: `${h.total ? (n / h.total) * 100 : 0}%` }} /></div>;

  return (
    <main className="max-w-3xl">
      <PageHeader title="Round overview" subtitle={<>Coverage and stage distribution of your investor list, with the assumptions behind every number.</>} />

      <section className="mb-6 grid gap-3 md:grid-cols-4">
        {[["Tracked", h.total], ["Contacted", `${h.contacted} (${h.coveragePct}%)`], ["In conversation", `${h.active} (${h.conversionPct}% of contacted)`], ["Fresh high signals", h.hotNow]].map(([l, v]) => (
          <div key={String(l)} className="card p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-bold">{v}</div></div>
        ))}
      </section>

      <section className="mb-6 card p-4">
        <h2 className="mb-3 font-semibold">Stage distribution</h2>
        {(Object.entries(h.dist) as [string, number][]).map(([k, n]) => (
          <div key={k} className="mb-2"><div className="flex justify-between text-sm"><span>{STATUS_LABEL[k]}</span><span>{n}</span></div>{bar(n)}</div>
        ))}
        <p className="mt-2 text-xs text-slate-500">{h.strongFit} investors have a thesis-keyword fit of 70+ (heuristic, see assumptions).</p>
      </section>

      <section className="mb-6 card p-4">
        <h2 className="mb-2 font-semibold">Gaps against your targets</h2>
        {!h.gaps.length ? <p className="text-sm">Targets met.</p> : <ul className="list-disc pl-5 text-sm">{h.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>}
        <div className="mt-5 border-t border-slate-200 pt-4">
          <SettingsForm columns={2} submit="Save targets" fields={[
            { key: "round_target_investors", label: "Investors to contact (target)", value: String(target.investorsToContact), type: "number" },
            { key: "round_target_conversations", label: "Live conversations needed (target)", value: String(target.conversationsNeeded), type: "number" },
          ]} />
        </div>
      </section>

      <section className="border border-slate-300 bg-slate-50 p-4 text-sm">
        <h2 className="mb-2 font-semibold">Assumptions</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-600">{[...ROUND_ASSUMPTIONS, ...FIT_ASSUMPTIONS].map((a, i) => <li key={i}>{a}</li>)}</ul>
      </section>
    </main>
  );
}
