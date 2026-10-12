"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtDate } from "@/lib/view/format";
import { avatarStyle, initials, signalStrength, STAGE_TITLE } from "@/lib/view/labels";
import Icon from "@/components/shell/Icon";

export interface DraftRow {
  vcId: string; firm: string; person: string | null; stage: string; score: number | null;
  subject: string; body: string;
  basedOn: { title: string; url: string; domain: string; date: string | null } | null;
}

type Filter = "signal" | "none" | "all";

export default function DraftList({ rows }: { rows: DraftRow[] }) {
  const withSignal = rows.filter((r) => r.basedOn).length;
  const [filter, setFilter] = useState<Filter>(withSignal ? "signal" : "all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const shown = useMemo(() => rows.filter((r) =>
    (filter === "all" || (filter === "signal") === !!r.basedOn) && (!q.trim() || `${r.firm} ${r.person ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, filter, q]);

  const copy = async (r: DraftRow) => {
    try { await navigator.clipboard.writeText(`Subject: ${r.subject}\n\n${r.body}`); setCopied(r.vcId); setTimeout(() => setCopied(null), 2000); } catch { /* clipboard unavailable */ }
  };

  const tabs: [Filter, string, number][] = [["signal", "Based on a signal", withSignal], ["none", "No signal yet", rows.length - withSignal], ["all", "All", rows.length]];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map(([k, label, n]) => (
            <button key={k} onClick={() => setFilter(k)} className={`border px-3 py-1.5 text-[0.8rem] font-semibold transition ${filter === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-900"}`}>
              {label} <span className={filter === k ? "text-slate-300" : "text-slate-400"}>{n}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-[16rem]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" className="h-4 w-4" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter investors" aria-label="Filter investors" className="!pl-9" />
        </div>
      </div>

      <ul className="space-y-3">
        {shown.map((r) => {
          const isOpen = open === r.vcId;
          const sg = signalStrength(r.score);
          const preview = r.body.split("\n").filter((l) => l.trim() && !/^Hi\b/.test(l) && !/^https?:/.test(l))[0] ?? "";
          return (
            <li key={r.vcId} className="card">
              <div className="flex flex-wrap items-start gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center font-display text-[0.72rem] font-bold" style={avatarStyle(r.firm)}>{initials(r.firm)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/investors/${r.vcId}`} className="font-bold text-slate-900 no-underline hover:text-indigo-700 hover:no-underline">{r.firm}</Link>
                    {r.person && <span className="text-sm text-slate-500">{r.person}</span>}
                    <span className="border border-slate-300 bg-slate-100 px-1.5 text-[0.66rem] font-bold uppercase tracking-wider text-slate-600">{STAGE_TITLE[r.stage] ?? r.stage}</span>
                    {r.basedOn && <span className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-400">{sg.label} signal</span>}
                  </div>
                  {r.basedOn ? (
                    <p className="mt-1 text-[0.82rem] text-slate-500">Based on <a href={r.basedOn.url} target="_blank" rel="noopener noreferrer" className="font-semibold">{r.basedOn.title}</a> · {r.basedOn.domain}{r.basedOn.date ? ` · ${fmtDate(r.basedOn.date)}` : ""}</p>
                  ) : <p className="mt-1 text-[0.82rem] text-slate-400">No recent signal, so this is a generic introduction.</p>}
                  {!isOpen && <p className="mt-2 line-clamp-2 text-[0.9rem] leading-snug text-slate-700">{preview}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setOpen(isOpen ? null : r.vcId)} className="btn-ghost !px-3 !py-1.5 !text-xs">{isOpen ? "Hide" : "Read"}</button>
                  <button onClick={() => copy(r)} className="btn-ghost !px-3 !py-1.5 !text-xs">{copied === r.vcId ? "Copied" : "Copy"}</button>
                  <Link href={`/investors/${r.vcId}#draft`} className="btn-primary !px-3 !py-1.5 !text-xs no-underline hover:no-underline">Edit and save</Link>
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-slate-200 bg-slate-50 p-4">
                  <div className="eyebrow mb-1">Subject</div>
                  <p className="mb-3 text-[0.9rem] font-semibold text-slate-800">{r.subject}</p>
                  <pre className="whitespace-pre-wrap font-sans text-[0.9rem] leading-relaxed text-slate-800">{r.body}</pre>
                </div>
              )}
            </li>
          );
        })}
        {!shown.length && <li className="card p-8 text-center text-sm text-slate-400">No investors match.</li>}
      </ul>
    </div>
  );
}
