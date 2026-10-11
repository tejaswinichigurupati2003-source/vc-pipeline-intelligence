"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./ui";

/** Loads the user's Gmail labels / calendars on demand and saves which ones are in scope. */
export default function ScopePicker({ provider, selected }: { provider: "gmail" | "calendar"; selected: string[] }) {
  const router = useRouter();
  const [opts, setOpts] = useState<{ id: string; name: string }[] | null>(null);
  const [sel, setSel] = useState<string[]>(selected);
  const [msg, setMsg] = useState("");
  const noun = provider === "gmail" ? "labels" : "calendars";

  const load = async () => {
    setMsg("Loading…");
    const res = await fetch(`/api/integrations/google?provider=${provider}`);
    const j = await res.json();
    if (!res.ok) return setMsg(j.error ?? "Failed");
    setOpts(j.options); setMsg("");
  };

  return (
    <div className="mt-2 text-sm">
      {!opts ? (
        <button onClick={load} className="rounded border px-2 py-1 text-xs">Choose {noun} to include ({selected.length} selected)</button>
      ) : (
        <div>
          <p className="mb-1 text-xs text-slate-500">Only the {noun} you tick are read. Nothing else in the account is touched.</p>
          <ul className="max-h-48 overflow-auto rounded border p-2">
            {opts.map((o) => (
              <li key={o.id}><label><input type="checkbox" checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} /> {o.name}</label></li>
            ))}
            {!opts.length && <li className="text-slate-500">None found.</li>}
          </ul>
          <button className="mt-2 rounded bg-slate-800 px-3 py-1 text-xs text-white" onClick={async () => {
            try { await postJson("/api/integrations/google", { provider, ids: sel }, "PUT"); setMsg("Saved"); router.refresh(); } catch (e) { setMsg((e as Error).message); }
          }}>Save selection</button>
        </div>
      )}
      {msg && <span className="ml-2 text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
