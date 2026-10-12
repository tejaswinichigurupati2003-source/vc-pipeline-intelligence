import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import { Badge, ApiButton } from "@/components/ui";
import { db } from "@/lib/db/client";
import { fmtDate } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function Signals() {
  const [{ data }, { data: vcs }, { data: runs }] = await Promise.all([
    db().from("vc_signals").select("id, vc_id, title, source_url, source_domain, source_tier, signal_type, published_at, event_at, relevance_score, confidence, evidence_basis, evidence_summary, verification_status, date_basis")
    .neq("verification_status", "superseded").order("created_at", { ascending: false }).limit(300),
    db().from("vc_pipeline").select("id, firm_name"),
    db().from("signal_runs").select("started_at, status").order("started_at", { ascending: false }).limit(1),
  ]);
  const name = new Map((vcs ?? []).map((v) => [v.id, v.firm_name]));
  const items = (data ?? []).map((s) => ({ ...s, when: s.event_at ?? s.published_at })).sort((a, b) => new Date(b.when ?? 0).getTime() - new Date(a.when ?? 0).getTime());

  return (
    <main>
      <PageHeader title="Market signals" subtitle="Verified news and activity from the investors you track, newest first." />
      {!items.length && <p className="card p-6 text-sm text-slate-500">No signals yet. Refresh to look for investor news.</p>}
      <ul className="space-y-2">
        {items.map((s) => (
          <li key={s.id} className={`card p-3 ${s.verification_status === "rejected_by_user" ? "opacity-50" : ""}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="font-medium">{s.title}</a>
                <div className="text-xs text-slate-500">
                  <Link href={`/investors/${s.vc_id}`}>{name.get(s.vc_id)}</Link> · {fmtDate(s.when)} · {s.signal_type.replace(/_/g, " ")} · {s.source_domain} ({s.source_tier}) · relevance {s.relevance_score}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge kind="public">Public</Badge>
                <Badge kind={s.confidence === "high" ? "verified" : "inferred"}>{s.confidence === "high" ? "Verified" : "Verified, medium confidence"}{s.evidence_basis === "headline_only" ? " · headline only" : ""}</Badge>
                {s.verification_status === "accepted" && <ApiButton url={`/api/vc/${s.vc_id}`} method="PATCH" body={{ signal_id: s.id }} label="Mark wrong" tone="danger" />}
                {s.verification_status === "rejected_by_user" && <Badge kind="warn">Marked wrong by you</Badge>}
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-700">{s.evidence_summary}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
