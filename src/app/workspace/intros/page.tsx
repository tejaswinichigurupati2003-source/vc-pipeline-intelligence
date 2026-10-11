import Link from "next/link";
import { ApiButton, ApiForm, Badge } from "@/components/ui";
import { db } from "@/lib/db/client";
import { findPaths } from "@/lib/intros/paths";
import { ensureVcNode, loadGraph } from "@/lib/intros/service";
import { fmtDate } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function Intros() {
  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_name").order("firm_name");
  for (const v of vcs ?? []) await ensureVcNode(v.id, v.firm_name);
  const { nodes, edges } = await loadGraph();
  const label = new Map(nodes.map((n) => [n.id, n]));
  const founder = nodes.find((n) => n.kind === "founder");
  const now = new Date();
  const withPaths = (vcs ?? []).map((v) => ({ v, paths: findPaths(nodes, edges, v.id, now, { maxPaths: 1 }) })).filter((x) => x.paths.length);
  const nodeOptions = nodes.filter((n) => n.kind !== "founder").map((n) => ({ value: n.id, label: `${n.label} (${n.kind.replace("_", " ")})` }));

  return (
    <main>
      <h1 className="text-2xl font-bold">Introduction paths</h1>
      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        Possible routes from you to an investor, built only from relationships <b>you</b> provide or approve. Appearing on the same email or event is weak evidence, so those edges start unconfirmed, capped at low confidence, and never count as actionable until you confirm them. Nothing here comes from anyone else&apos;s data.
      </p>

      <section className="mb-6 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">1. Add your contacts</h2>
          <p className="mb-2 text-xs text-slate-500">Paste a CSV you choose to share. Columns: name, email, company, relationship (knows/worked_with/introduced), confidence (0-1), vc_firm (works at a tracked firm), portfolio_of (founded a company that firm backed), note.</p>
          <ApiForm url="/api/intros" fields={[{ name: "csv", label: "Contacts CSV", type: "textarea", required: true, placeholder: "name,email,company,relationship,portfolio_of\nAsha Rao,asha@example.com,TruckLens,knows,Blume Ventures" }]} extra={{ action: "contacts_csv" }} submit="Import contacts" />
          <div className="mt-3"><ApiForm url="/api/intros" className="flex items-end gap-2" fields={[{ name: "label", label: "Your name in the graph", required: true, defaultValue: founder?.label ?? "" }]} extra={{ action: "set_founder" }} submit="Set" /></div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <h2 className="font-semibold">2. Add or correct a relationship</h2>
          <ApiForm url="/api/intros" fields={[
            { name: "to_node", label: "Person / investor", type: "select", options: nodeOptions, required: true },
            { name: "relation_type", label: "Relationship to you", type: "select", required: true, options: ["knows", "worked_with", "introduced", "invested_in", "spoke_with"].map((x) => ({ value: x, label: x.replace("_", " ") })) },
            { name: "confidence", label: "How strong (0-1)", type: "number", defaultValue: "0.6" },
            { name: "can_act", label: "I can legitimately ask for an intro through this", type: "checkbox", defaultValue: "true" },
          ]} extra={{ action: "edge" }} submit="Save relationship" />
        </div>
      </section>

      <h2 className="mb-2 font-semibold">Possible paths ({withPaths.length})</h2>
      {!withPaths.length && <p className="text-sm text-slate-500">No paths yet. Import contacts that connect to a tracked firm (vc_firm or portfolio_of).</p>}
      <ul className="mb-8 space-y-3">
        {withPaths.map(({ v, paths }) => {
          const p = paths[0];
          return (
            <li key={v.id} className="rounded-lg border bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/workspace/vc/${v.id}`} className="font-medium">{v.firm_name}</Link>
                <Badge kind="neutral">possible introduction path</Badge>
                {p.actionable ? <Badge kind="confirmed">Confirmed &amp; actionable</Badge> : <Badge kind="inferred">Needs your confirmation ({p.needsConfirmation.length})</Badge>}
                <span className="text-xs text-slate-500">confidence {p.confidence} · {p.hops} hop{p.hops > 1 ? "s" : ""}</span>
              </div>
              <div className="mt-1">{p.nodes.map((n) => n.label).join(" → ")}</div>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-2 font-semibold">All relationships ({edges.length})</h2>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-100 uppercase text-slate-500"><tr><th className="p-2">From → To</th><th className="p-2">Type</th><th className="p-2">Provenance</th><th className="p-2">Conf.</th><th className="p-2">Last seen</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
          <tbody>
            {edges.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{label.get(e.from_node)?.label} → {label.get(e.to_node)?.label}</td>
                <td className="p-2">{e.relation_type.replace("_", " ")}</td>
                <td className="p-2">{e.provenance.replace("_", " ")}</td>
                <td className="p-2">{e.confidence}</td>
                <td className="p-2">{fmtDate(e.last_observed_at)}</td>
                <td className="p-2">{e.user_confirmed ? <Badge kind="confirmed">You confirmed</Badge> : <Badge kind="inferred">Unconfirmed</Badge>} {e.can_act ? "" : <Badge kind="neutral">not actionable</Badge>}</td>
                <td className="p-2 space-x-1 whitespace-nowrap">
                  {!e.user_confirmed && <ApiButton url="/api/workspace" body={{ entity: "edge", op: "update", id: e.id, values: { user_confirmed: true, can_act: true } }} label="Confirm" />}
                  <ApiButton url="/api/workspace" body={{ entity: "edge", op: "delete", id: e.id }} label="Wrong: remove" tone="danger" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
