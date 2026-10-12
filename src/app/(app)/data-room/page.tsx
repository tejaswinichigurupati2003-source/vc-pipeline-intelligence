import { ApiButton, ApiForm, Badge } from "@/components/ui";
import PageHeader from "@/components/shell/PageHeader";
import SettingsForm from "@/components/SettingsForm";
import { db } from "@/lib/db/client";
import { fmtDate } from "@/lib/view/format";
import { getSettings } from "@/lib/workspace/data";

export const dynamic = "force-dynamic";

export default async function Materials() {
  const s = await getSettings();
  const { data: materials } = await db().from("materials").select("*").order("created_at", { ascending: false });
  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_name").order("firm_name");
  const name = new Map((vcs ?? []).map((v) => [v.id, v.firm_name]));
  const { data: dd } = await db().from("diligence_requests").select("*").order("created_at", { ascending: false });
  const approved = (materials ?? []).filter((m) => m.approved).length;
  const open = (dd ?? []).filter((d) => d.status !== "provided").length;

  return (
    <main>
      <PageHeader title="Data room" subtitle="Company facts and documents used in your drafts and meeting briefs. Only approved items are used." />

      <section className="mb-8 card">
        <h2 className="border-b border-slate-900 bg-slate-50 px-4 py-3">Company profile <span className="font-sans text-[0.72rem] normal-case tracking-normal text-slate-500">used in drafts and briefs</span></h2>
        <div className="p-4">
          <SettingsForm columns={3} fields={[
            { key: "founder_name", label: "Your name", value: s.founder_name ?? "" },
            { key: "company_name", label: "Company name", value: s.company_name ?? "" },
            { key: "company_one_liner", label: "One-liner", value: s.company_one_liner ?? "", hint: "One sentence on what you build" },
          ]} />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-semibold">Company claims & documents</h2>
        <ApiForm url="/api/workspace" className="my-3 grid max-w-2xl gap-2 md:grid-cols-2" submit="Add"
          fields={[{ name: "kind", label: "Type", type: "select", required: true, options: [{ value: "claim", label: "Claim (a factual statement)" }, { value: "document", label: "Document" }] }, { name: "title", label: "Title", required: true }, { name: "claim_text", label: "Claim text (exactly what a draft may say)", type: "textarea" }, { name: "source_url", label: "Evidence / document link" }]}
          envelope={{ entity: "materials", op: "insert" }} />
        <ul className="space-y-2">
          {(materials ?? []).map((m) => (
            <li key={m.id} className="card-sm p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <b>{m.title}</b> <Badge kind="neutral">{m.kind}</Badge>
                {m.approved ? <Badge kind="confirmed">Approved {fmtDate(m.approved_at)}</Badge> : <Badge kind="inferred">Not approved</Badge>}
                <ApiButton url="/api/workspace" body={{ entity: "materials", op: "update", id: m.id, values: { approved: !m.approved } }} label={m.approved ? "Revoke approval" : "Approve"} />
                <ApiButton url="/api/workspace" body={{ entity: "materials", op: "delete", id: m.id }} label="Delete" tone="danger" confirm="Delete this item?" />
              </div>
              {m.claim_text && <p className="mt-1">{m.claim_text}</p>}
              {m.source_url && <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="text-xs">Evidence</a>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold">Investor diligence requests</h2>
        <ApiForm url="/api/workspace" className="my-3 grid max-w-2xl gap-2 md:grid-cols-2" submit="Add request"
          fields={[{ name: "vc_id", label: "Investor", type: "select", required: true, options: (vcs ?? []).map((v) => ({ value: v.id, label: v.firm_name })) }, { name: "request_text", label: "What they asked for", required: true }, { name: "material_id", label: "Matching material (optional)", type: "select", options: (materials ?? []).map((m) => ({ value: m.id, label: m.title })) }, { name: "due_at", label: "Due", type: "date" }]}
          envelope={{ entity: "diligence", op: "insert" }} />
        <ul className="space-y-2">
          {(dd ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 card-sm p-3 text-sm">
              <span>{name.get(d.vc_id)}: {d.request_text}</span>
              <Badge kind={d.status === "provided" ? "verified" : d.status === "blocked" ? "warn" : "inferred"}>{d.status}</Badge>
              {d.due_at && <span className="text-xs text-slate-500">due {fmtDate(d.due_at)}</span>}
              {d.status !== "provided" && <ApiButton url="/api/workspace" body={{ entity: "diligence", op: "update", id: d.id, values: { status: "provided" } }} label="Mark provided" />}
              <ApiButton url="/api/workspace" body={{ entity: "diligence", op: "delete", id: d.id }} label="Delete" tone="danger" />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
