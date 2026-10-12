"use client";

import { useState } from "react";
import Icon from "@/components/shell/Icon";
import { fmtDate } from "@/lib/view/format";
import { postJson } from "./ui";

export interface DraftView {
  subject: string;
  body: string;
  to: string;
  warnings: string[];
  basedOn: { title: string; url: string; domain: string; date: string | null } | null;
}

const friendlyError = (m: string) => (/not connected/i.test(m) ? "Connect Gmail in Integrations to save drafts." : /Gmail API has not been used|disabled/i.test(m) ? "Gmail isn't switched on for this account yet." : m);

/** A ready-made message for this investor, built from their strongest signal. Edit it, copy it, or save it to Gmail drafts. */
export default function DraftPanel({ vcId, initial }: { vcId: string; initial: DraftView }) {
  const [d, setD] = useState<DraftView>(initial);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [style, setStyle] = useState<"standard" | "short">("standard");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  const regenerate = async (next: "standard" | "short") => {
    setStyle(next); setBusy(true); setMsg(null); setUrl(null);
    try {
      const j = await postJson("/api/drafts", { vc_id: vcId, style: next });
      setD({ subject: j.draft.subject, body: j.draft.body, to: j.to, warnings: j.draft.warnings, basedOn: j.basedOn });
      setSubject(j.draft.subject); setBody(j.draft.body);
    } catch (e) { setMsg({ text: friendlyError((e as Error).message), bad: true }); }
    setBusy(false);
  };

  const save = async () => {
    setBusy(true); setMsg(null); setUrl(null);
    try {
      const j = await postJson("/api/drafts", { vc_id: vcId, style, create: true, subject, body, to: d.to });
      setMsg({ text: "Saved to your Gmail drafts." }); setUrl(j.created?.url ?? null);
    } catch (e) { setMsg({ text: friendlyError((e as Error).message), bad: true }); }
    setBusy(false);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`); setMsg({ text: "Copied." }); }
    catch { setMsg({ text: "Couldn't copy. Select the text and copy it manually.", bad: true }); }
  };

  const edited = subject !== d.subject || body !== d.body;

  return (
    <section id="draft" className="card mb-6 scroll-mt-24">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900 bg-slate-50 px-4 py-3">
        <h2>Suggested message</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-slate-300 bg-white text-xs font-semibold">
            {(["standard", "short"] as const).map((s) => (
              <button key={s} disabled={busy} onClick={() => regenerate(s)} className={`px-3 py-1.5 capitalize ${style === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{s}</button>
            ))}
          </div>
          <button onClick={copy} className="btn-ghost !px-3 !py-1.5 !text-xs">Copy</button>
          <button disabled={busy} onClick={save} className="btn-primary !px-3 !py-1.5 !text-xs">Save to Gmail drafts</button>
        </div>
      </header>

      <div className="p-4">
        {d.basedOn ? (
          <p className="mb-3 flex flex-wrap items-center gap-x-2 text-[0.82rem] text-slate-500">
            <Icon name="signal" className="h-3.5 w-3.5 text-indigo-700" /> Based on
            <a href={d.basedOn.url} target="_blank" rel="noopener noreferrer" className="font-semibold">{d.basedOn.title}</a>
            <span>· {d.basedOn.domain}{d.basedOn.date ? ` · ${fmtDate(d.basedOn.date)}` : ""}</span>
          </p>
        ) : null}
        {d.warnings.map((w, i) => <p key={i} className="mb-2 border-l-2 border-amber-500 pl-3 text-[0.85rem] text-amber-900">{w}</p>)}

        <label className="block text-xs font-semibold text-slate-600">Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 !font-normal" />
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-600">Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={Math.min(18, Math.max(8, body.split("\n").length + 1))} className="mt-1 font-sans !text-[0.92rem] leading-relaxed !font-normal" />
        </label>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>To: {d.to || "add a recipient in Gmail"}</span>
          {edited && <button className="font-semibold text-indigo-700 hover:underline" onClick={() => { setSubject(d.subject); setBody(d.body); }}>Reset to suggestion</button>}
          {msg && <span className={`font-semibold ${msg.bad ? "text-rose-700" : "text-emerald-700"}`}>{msg.text}</span>}
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold">Open in Gmail</a>}
        </div>
        <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-400">Nothing is sent until you send it yourself.</p>
      </div>
    </section>
  );
}
