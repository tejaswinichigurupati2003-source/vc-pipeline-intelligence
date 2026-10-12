"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./ui";

export interface ContextValues { name: string; sector: string; productSummary: string; targetCustomer: string; geography: string; businessModel: string; stage: string; round: string }

const FIELDS: { key: keyof ContextValues; label: string; hint?: string; wide?: boolean }[] = [
  { key: "name", label: "Company" },
  { key: "sector", label: "Sector", hint: "e.g. B2B logistics SaaS" },
  { key: "stage", label: "Stage", hint: "e.g. Seed" },
  { key: "round", label: "Round you're raising", hint: "e.g. Seed" },
  { key: "targetCustomer", label: "Who you sell to", wide: true },
  { key: "geography", label: "Where you operate", hint: "Comma separated, e.g. India, Southeast Asia", wide: true },
  { key: "businessModel", label: "Business model", wide: true },
  { key: "productSummary", label: "What you build", hint: "Two or three sentences. Used to find investors who back similar companies.", wide: true },
];

export default function CompanyContextForm({ values, isSample }: { values: ContextValues; isSample: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);
  const run = async (body: unknown, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setState(null);
    try { const j = await postJson("/api/company", body); setState({ ok: true, msg: j.message ?? "Saved" }); router.refresh(); }
    catch (e) { setState({ ok: false, msg: (e as Error).message }); }
    setBusy(false);
  };
  return (
    <div>
      {isSample && <p className="mb-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">You're viewing a sample company (RouteFlow) with made-up numbers. Remove it before adding your own details.</p>}
      <form className="grid gap-4 md:grid-cols-4" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({ action: "save", ...Object.fromEntries(FIELDS.map((f) => [f.key, String(fd.get(f.key) ?? "").trim()])) });
      }}>
        {FIELDS.map((f) => (
          <label key={f.key} className={`block ${f.wide ? "md:col-span-4" : ""}`}>
            <span className="text-[0.78rem] font-semibold text-slate-600">{f.label}</span>
            {f.key === "productSummary"
              ? <textarea name={f.key} defaultValue={values[f.key]} rows={3} className="mt-1" />
              : <input name={f.key} defaultValue={values[f.key]} className="mt-1" />}
            {f.hint && <span className="mt-1 block text-xs text-slate-400">{f.hint}</span>}
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-3 md:col-span-4">
          <button disabled={busy} className="btn-primary">{busy ? "Working…" : "Save company details"}</button>
          {isSample
            ? <button type="button" disabled={busy} className="btn border-rose-200 bg-white text-rose-700 hover:bg-rose-50" onClick={() => run({ action: "clear_sample" }, "Remove the sample company and its documents?")}>Remove sample company</button>
            : <button type="button" disabled={busy} className="btn border-slate-300 bg-white text-slate-700 hover:bg-slate-50" onClick={() => run({ action: "load_sample" }, "Load the sample company (RouteFlow)? It replaces the company details shown here.")}>Try with a sample company</button>}
          {state && <span className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.msg}</span>}
        </div>
      </form>
    </div>
  );
}
