"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./ui";

const FIELDS = ["investor_name", "firm_name", "firm_domain", "investment_thesis", "sector_keywords", "contact_status", "last_contact_at", "contact_history", "personal_notes", "email", "profile_url"];

interface PlannedRow { index: number; action: string; matchBasis?: string; fill: Record<string, unknown>; conflicts: { field: string; existing: string; incoming: string }[]; issues: { level: string; message: string }[]; data?: { investor_name: string; firm_name: string }; possibleDuplicateOf?: { reason: string } }
interface Preview { headers: string[]; mapping: Record<string, string>; plan: { rows: PlannedRow[]; summary: Record<string, number> }; sample: Record<string, string>[] }

export default function ImportWizard() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const preview = async (text: string, m?: Record<string, string>) => {
    setBusy(true); setMsg(null); setResult(null);
    try {
      const j: Preview = await postJson("/api/import/preview", { csv: text, mapping: m });
      setPrev(j); setMapping(j.mapping);
    } catch (e) { setMsg({ t: (e as Error).message, ok: false }); }
    setBusy(false);
  };

  const s = prev?.plan.summary;
  return (
    <div>
      <label className="block text-sm">
        <span className="text-xs text-slate-500">1. Choose your tracker (CSV)</span>
        <input type="file" accept=".csv,text/csv" className="mt-1 block text-sm" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const text = await f.text(); setCsv(text); setFilename(f.name); await preview(text);
        }} />
      </label>
      <p className="mt-1 text-xs text-slate-500">Nothing is written until you press Import. Existing rows are never overwritten: blanks are filled, differences become conflicts for you to resolve.</p>

      {prev && (
        <>
          <h3 className="mt-5 text-sm font-semibold">2. Map columns</h3>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f} className="text-xs">
                <span className="text-slate-500">{f}</span>
                <select value={mapping[f] ?? ""} onChange={(e) => { const m = { ...mapping }; if (e.target.value) m[f] = e.target.value; else delete m[f]; setMapping(m); }} className="mt-1 w-full rounded border px-1 py-1 text-sm">
                  <option value="">(not in file)</option>
                  {prev.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button disabled={busy} onClick={() => preview(csv, mapping)} className="mt-2 rounded border px-3 py-1 text-xs">Re-run dry run with this mapping</button>

          <h3 className="mt-5 text-sm font-semibold">3. Dry-run report</h3>
          {s && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {[["New", s.insert], ["Merge into existing", s.merge], ["Skipped", s.skip], ["Invalid", s.invalid], ["Blanks to fill", s.filledFields], ["Conflicts for you", s.conflicts], ["Possible duplicates", s.ambiguous]].map(([l, n]) => (
                <span key={String(l)} className="rounded bg-slate-100 px-2 py-1"><b>{n}</b> {l}</span>
              ))}
            </div>
          )}
          <div className="mt-2 max-h-80 overflow-auto rounded border bg-white">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-500"><tr><th className="p-1">Row</th><th className="p-1">Action</th><th className="p-1">Investor</th><th className="p-1">Details</th></tr></thead>
              <tbody>
                {prev.plan.rows.filter((r) => r.action !== "insert" || r.issues.length).map((r) => (
                  <tr key={r.index} className="border-t align-top">
                    <td className="p-1">{r.index}</td>
                    <td className="p-1">{r.action}{r.matchBasis ? ` (by ${r.matchBasis.replace(/_/g, " ")})` : ""}</td>
                    <td className="p-1">{r.data?.firm_name}</td>
                    <td className="p-1">
                      {Object.keys(r.fill).length > 0 && <div>Fill blanks: {Object.keys(r.fill).join(", ")}</div>}
                      {r.conflicts.map((c, i) => <div key={i} className="text-amber-800">Conflict {c.field}: keep &quot;{c.existing.slice(0, 40)}&quot; vs incoming &quot;{c.incoming.slice(0, 40)}&quot;</div>)}
                      {r.issues.map((x, i) => <div key={i} className={x.level === "error" ? "text-rose-700" : "text-slate-500"}>{x.message}</div>)}
                    </td>
                  </tr>
                ))}
                {prev.plan.rows.every((r) => r.action === "insert" && !r.issues.length) && <tr><td colSpan={4} className="p-2 text-slate-500">All {prev.plan.rows.length} rows are new and clean.</td></tr>}
              </tbody>
            </table>
          </div>

          <button disabled={busy || !s || s.insert + s.merge === 0} className="mt-3 rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50" onClick={async () => {
            setBusy(true); setMsg(null);
            try { const j = await postJson("/api/import/commit", { csv, mapping, filename }); setResult(j); setPrev(null); router.refresh(); }
            catch (e) { setMsg({ t: (e as Error).message, ok: false }); }
            setBusy(false);
          }}>4. Import {s ? `${s.insert} new + ${s.merge} merges` : ""}</button>
        </>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.t}</p>}
      {result && <pre className="mt-3 rounded bg-emerald-50 p-3 text-xs text-emerald-900">{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
