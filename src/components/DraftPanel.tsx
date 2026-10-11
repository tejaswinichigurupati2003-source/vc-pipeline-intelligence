"use client";

import { useState } from "react";
import { postJson } from "./ui";

interface DraftResp { draft: { subject: string; body: string; usedMaterials: string[]; warnings: string[] }; to?: string; created?: { url: string } }

/** Compose from verified evidence + approved claims. Saving as a Gmail DRAFT is explicit; sending is always done by the founder in Gmail. */
export default function DraftPanel({ vcId }: { vcId: string }) {
  const [d, setD] = useState<DraftResp | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (create: boolean) => {
    setBusy(true); setMsg("");
    try { setD(await postJson("/api/drafts", { vc_id: vcId, create })); if (create) setMsg("Saved as a draft in Gmail. Review and send it from there."); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  return (
    <section className="mt-6 rounded-lg border bg-white p-4">
      <h2 className="font-semibold">Draft message</h2>
      <p className="text-xs text-slate-500">Uses one verified public signal (with its link) and your approved claims only. It never says the investor is interested in your company, and it is never sent automatically.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => run(false)} className="rounded border px-3 py-1 text-xs">Preview draft</button>
        <button disabled={busy} onClick={() => run(true)} className="rounded bg-slate-800 px-3 py-1 text-xs text-white">Save as Gmail draft</button>
      </div>
      {msg && <p className="mt-2 text-xs text-slate-700">{msg}</p>}
      {d && (
        <div className="mt-3 text-sm">
          {d.draft.warnings.map((w, i) => <p key={i} className="text-xs text-amber-800">⚠ {w}</p>)}
          <div className="text-xs text-slate-500">To: {d.to || "(add recipient in Gmail)"} · Subject: {d.draft.subject}</div>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-3 font-sans">{d.draft.body}</pre>
          {d.created?.url && <a href={d.created.url} target="_blank" rel="noopener noreferrer" className="text-xs">Open draft in Gmail</a>}
        </div>
      )}
    </section>
  );
}
