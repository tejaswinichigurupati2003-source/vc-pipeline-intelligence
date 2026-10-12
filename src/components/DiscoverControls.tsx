"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/components/ui";

/** "Find investors now": runs one discovery pass (about a minute) and reports what it found. */
export function FindInvestorsButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button disabled={busy || disabled} className="btn-primary" onClick={async () => {
        setBusy(true); setMsg(null);
        try {
          const r = await postJson("/api/expansion/run", {});
          if (r.skipped === "already_running") setMsg({ ok: true, text: "A search is already running. Check back in a minute." });
          else if (r.skipped === "no_context") setMsg({ ok: false, text: "Add your company details first." });
          else if (!r.ok) setMsg({ ok: false, text: r.error ?? "The search could not finish. Try again shortly." });
          else setMsg({ ok: true, text: r.newCount ? `${r.newCount} new investor${r.newCount === 1 ? "" : "s"} found.` : "No new investors this time." });
          router.refresh();
        } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
        setBusy(false);
      }}>{busy ? "Searching…" : "Find investors now"}</button>
      {busy && <span className="text-xs text-slate-500">This takes about a minute.</span>}
      {msg && <span className={`text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
    </div>
  );
}

export function SuggestionActions({ id, status, vcId }: { id: string; status: "new" | "added" | "dismissed"; vcId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const act = async (action: "add" | "dismiss" | "restore") => {
    setBusy(true); setErr("");
    try { await postJson("/api/expansion/suggestions", { id, action }); router.refresh(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  if (status === "added") return <a className="btn border-slate-300 bg-white text-slate-700 no-underline hover:bg-slate-50" href={vcId ? `/investors/${vcId}` : "/investors"}>On your list: open</a>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "new" && <button disabled={busy} className="btn-primary" onClick={() => act("add")}>{busy ? "Adding…" : "Add to my list"}</button>}
      {status === "new" ? <button disabled={busy} className="btn border-slate-300 bg-white text-slate-700 hover:bg-slate-50" onClick={() => act("dismiss")}>Dismiss</button>
        : <button disabled={busy} className="btn border-slate-300 bg-white text-slate-700 hover:bg-slate-50" onClick={() => act("restore")}>Restore</button>}
      {err && <span className="text-xs text-rose-700">{err}</span>}
    </div>
  );
}
