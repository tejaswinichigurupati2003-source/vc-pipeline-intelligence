"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyIntegrationError, type FriendlyError } from "@/lib/view/errors";
import { postJson } from "./ui";

/** Loads the user's Gmail labels / calendars on demand and saves which ones are included. */
export default function ScopePicker({ provider, selected }: { provider: "gmail" | "calendar"; selected: string[] }) {
  const router = useRouter();
  const [opts, setOpts] = useState<{ id: string; name: string }[] | null>(null);
  const [sel, setSel] = useState<string[]>(selected);
  const [status, setStatus] = useState<{ kind: "loading" | "saved" | "error"; err?: FriendlyError } | null>(null);
  const noun = provider === "gmail" ? "labels" : "calendars";

  const load = async () => {
    setStatus({ kind: "loading" });
    const res = await fetch(`/api/integrations/google?provider=${provider}`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setStatus({ kind: "error", err: friendlyIntegrationError(j.error, provider) ?? { text: "Something went wrong. Please try again." } });
    setOpts(j.options); setStatus(null);
  };

  const save = async () => {
    try { await postJson("/api/integrations/google", { provider, ids: sel }, "PUT"); setStatus({ kind: "saved" }); router.refresh(); }
    catch (e) { setStatus({ kind: "error", err: friendlyIntegrationError((e as Error).message, provider) ?? { text: "Couldn't save. Please try again." } }); }
  };

  return (
    <div className="text-sm">
      {!opts ? (
        <button onClick={load} disabled={status?.kind === "loading"} className="btn-ghost !px-3 !py-1.5 !text-xs">
          {status?.kind === "loading" ? "Loading…" : selected.length ? `Change ${noun} (${selected.length} included)` : `Choose ${noun} to include`}
        </button>
      ) : (
        <div>
          <p className="mb-2 text-xs text-slate-500">Only the {noun} you tick are read.</p>
          <ul className="scroll-thin max-h-48 space-y-1 overflow-auto border border-slate-300 bg-white p-2">
            {opts.map((o) => (
              <li key={o.id}><label className="flex items-center gap-2"><input type="checkbox" checked={sel.includes(o.id)} onChange={(e) => setSel(e.target.checked ? [...sel, o.id] : sel.filter((x) => x !== o.id))} /> <span className="break-words">{o.name}</span></label></li>
            ))}
            {!opts.length && <li className="text-slate-500">None found.</li>}
          </ul>
          <button className="btn-primary mt-2 !px-3 !py-1.5 !text-xs" onClick={save}>Save selection</button>
        </div>
      )}
      {status?.kind === "saved" && <p className="mt-1.5 text-xs font-semibold text-emerald-700">Saved.</p>}
      {status?.kind === "error" && status.err && (
        <p className="mt-1.5 text-xs font-medium text-rose-700">
          {status.err.text}{" "}
          {status.err.fixUrl && <a href={status.err.fixUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{status.err.fixLabel ?? "Fix it"}</a>}
        </p>
      )}
    </div>
  );
}
