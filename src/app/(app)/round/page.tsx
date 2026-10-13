import Link from "next/link";
import CountUp from "@/components/CountUp";
import PageHeader from "@/components/shell/PageHeader";
import SettingsForm from "@/components/SettingsForm";
import { fitScore } from "@/lib/insights/fit";
import { DEFAULT_TARGET, roundHealth } from "@/lib/insights/round-health";
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
  const bar = (n: number) => <div className="h-2 border border-slate-900 bg-white"><div className="h-full grad-cherry transition-[width] duration-700 ease-out" style={{ width: `${h.total ? (n / h.total) * 100 : 0}%` }} /></div>;

  return (
    <main className="max-w-3xl">
      <PageHeader title="Round overview" subtitle={<>Where your round stands against your targets.</>} />

      <section className="mb-6 grid gap-3 md:grid-cols-4">
        {([["Tracked", h.total, "", "/investors"], ["Contacted", h.contacted, `${h.coveragePct}% of your list`, "/investors?stage=contacted"], ["In conversation", h.active, `${h.conversionPct}% of contacted`, "/investors?stage=in_conversation"], ["Fresh high signals", h.hotNow, "", "/investors?filter=hot"]] as [string, number, string, string][]).map(([l, v, sub, href]) => (
          <Link key={l} href={href} className="tile-link no-underline hover:no-underline" title="See these investors"><div className="text-xs text-slate-500">{l}</div><div className="font-display text-2xl font-semibold text-slate-900"><CountUp value={v} />{sub && <span className="ml-2 font-sans text-xs font-medium text-slate-400">{sub}</span>}</div></Link>
        ))}
      </section>

      <section className="mb-6 card p-4">
        <h2 className="mb-3 font-semibold">Stage distribution</h2>
        {(Object.entries(h.dist) as [string, number][]).map(([k, n]) => (
          <Link key={k} href={`/investors?stage=${k}`} className="group mb-3 block no-underline hover:no-underline" title="See these investors"><div className="mb-1 flex justify-between text-sm text-slate-700 group-hover:text-indigo-700"><span>{STATUS_LABEL[k]}</span><span className="font-semibold"><CountUp value={n} /></span></div>{bar(n)}</Link>
        ))}
        <p className="mt-2 text-xs text-slate-500">{h.strongFit} investors are a strong match for your thesis.</p>
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


    </main>
  );
}
