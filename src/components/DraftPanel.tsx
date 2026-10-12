"use client";

import { useState } from "react";
import { postJson } from "./ui";

interface DraftResp { draft: { subject: string; body: string; usedMaterials: string[]; warnings: string[] }; to?: string; created?: { url: string } }

const friendlyError = (m: string) => (/not connected/i.test(m) ? "Connect Gmail in Integrations to save drafts." : m);

/** Preview a message, or save it as a Gmail draft. The founder always sends it themselves. */
export default function DraftPanel({ vcId }: { vcId: string }) {
  const [d, setD] = useState<DraftResp | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (create: boolean) => {
    setBusy(true); setMsg(null);
    try {
      setD(await postJson("/api/drafts", { vc_id: vcId, create }));
      if (create) setMsg({ text: "Saved to your Gmail drafts." });
    } catch (e) { setMsg({ text: friendlyError((e as Error).message), bad: true }); }
    setBusy(false);
  };
  return (
    <section className="card mb-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900 bg-slate-50 px-4 py-3">
        <h2>Draft message</h2>
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => run(false)} className="btn-ghost !px-3 !py-1.5 !text-xs">Preview</button>
          <button disabled={busy} onClick={() => run(true)} className="btn-primary !px-3 !py-1.5 !text-xs">Save to Gmail drafts</button>
        </div>
      </header>
      <div className="p-4">
        {!d && !msg && <p className="text-[0.9rem] text-slate-500">Write a first message using a recent signal and your approved company facts. Nothing is sent until you send it yourself.</p>}
        {msg && <p className={`text-sm font-medium ${msg.bad ? "text-rose-700" : "text-emerald-700"}`}>{msg.text}</p>}
        {d && (
          <div className="mt-2 text-sm">
            {d.draft.warnings.map((w, i) => <p key={i} className="mb-1 border-l-2 border-amber-500 pl-3 text-[0.85rem] text-amber-900">{w}</p>)}
            <div className="mt-3 text-xs text-slate-500"><b className="text-slate-700">To</b> {d.to || "Add a recipient in Gmail"} · <b className="text-slate-700">Subject</b> {d.draft.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap border border-slate-300 bg-slate-50 p-4 font-sans text-[0.9rem] leading-relaxed text-slate-800">{d.draft.body}</pre>
            {d.created?.url && <a href={d.created.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-semibold">Open in Gmail</a>}
          </div>
        )}
      </div>
    </section>
  );
}
