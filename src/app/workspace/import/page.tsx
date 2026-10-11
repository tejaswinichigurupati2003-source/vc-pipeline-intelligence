import ImportWizard from "@/components/ImportWizard";
import { ApiButton, Badge } from "@/components/ui";
import { db } from "@/lib/db/client";
import { fmtDateTime } from "@/lib/view/format";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { data: conflicts } = await db().from("import_conflicts").select("*").eq("status", "pending").order("created_at", { ascending: false });
  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_name");
  const name = new Map((vcs ?? []).map((v) => [v.id, v.firm_name]));
  const { data: batches } = await db().from("import_batches").select("id, source, filename, status, summary, created_vc_ids, created_at").order("created_at", { ascending: false }).limit(20);

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold">Import & export</h1>
      <p className="mb-4 text-sm text-slate-600">Bring in your existing tracker without losing anything, and take your data out whenever you like.</p>

      <section className="mb-8 rounded-lg border bg-white p-4"><ImportWizard /></section>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Conflicts to resolve ({conflicts?.length ?? 0})</h2>
        <p className="mb-2 text-xs text-slate-500">The existing value is kept until you choose. &quot;Use incoming&quot; is the only action that changes your data.</p>
        {!conflicts?.length && <p className="text-sm text-slate-500">None.</p>}
        <ul className="space-y-2">
          {(conflicts ?? []).map((c) => (
            <li key={c.id} className="rounded border bg-white p-3 text-sm">
              <div><b>{name.get(c.vc_id)}</b> · <code>{c.field}</code> <Badge kind="neutral">{c.source}</Badge> <span className="text-xs text-slate-500">matched by {c.match_basis.replace(/_/g, " ")}</span></div>
              <div className="mt-1 grid gap-2 text-xs md:grid-cols-2">
                <div className="rounded bg-slate-50 p-2"><div className="text-slate-500">Existing (kept)</div>{c.existing_value}</div>
                <div className="rounded bg-amber-50 p-2"><div className="text-slate-500">Incoming</div>{c.incoming_value}</div>
              </div>
              <div className="mt-2 flex gap-2">
                <ApiButton url="/api/import/conflicts" body={{ id: c.id, choice: "keep_existing" }} label="Keep existing" />
                <ApiButton url="/api/import/conflicts" body={{ id: c.id, choice: "use_incoming" }} label="Use incoming" confirm="Replace the existing value with the incoming one?" />
                <ApiButton url="/api/import/conflicts" body={{ id: c.id, choice: "ignore" }} label="Ignore" tone="quiet" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 font-semibold">Export</h2>
        <div className="flex gap-3 text-sm">
          <a href="/api/export?type=pipeline" className="rounded border px-3 py-1.5">Pipeline CSV (re-importable, includes your notes)</a>
          <a href="/api/export?type=evidence" className="rounded border px-3 py-1.5">Evidence summary CSV</a>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Import history</h2>
        <ul className="space-y-1 text-sm">
          {(batches ?? []).map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 rounded border bg-white p-2">
              <span>{fmtDateTime(b.created_at)}</span> <Badge kind="neutral">{b.source}</Badge> <span>{b.filename ?? ""}</span>
              <span className="text-xs text-slate-500">{(b.summary as { insert?: number; merge?: number }).insert ?? 0} new, {(b.summary as { merge?: number }).merge ?? 0} merged</span>
              {b.status === "reverted" ? <Badge kind="warn">reverted</Badge> : (b.created_vc_ids as string[]).length > 0 && (
                <ApiButton url="/api/import/revert" body={{ batch_id: b.id }} label={`Undo: remove the ${(b.created_vc_ids as string[]).length} investors it created`} tone="danger" confirm="Remove the investors this import created (and their evidence)? Merged-into rows are not touched." />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
