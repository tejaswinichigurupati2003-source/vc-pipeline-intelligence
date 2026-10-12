"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Icon from "@/components/shell/Icon";
import { STATE_LABEL, type RelationshipState } from "@/lib/relationships/classify";
import { cleanSummary, type BoardRow } from "@/lib/view/board";
import { avatarStyle, formatAction, initials, signalStrength, STAGES, TONE_CLASS, timeAgo, type Tone } from "@/lib/view/labels";

type Filter = "all" | "hot" | "warm" | "quiet" | "stale";
type Sort = "score" | "name" | "recent";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "hot", label: "Hot" }, { key: "warm", label: "Warm" }, { key: "quiet", label: "Quiet" }, { key: "stale", label: "Needs refresh" },
];

function matches(r: BoardRow, f: Filter) {
  if (f === "all") return true;
  if (f === "stale") return r.bucket === "stale";
  if (r.bucket === "stale") return false;
  return signalStrength(r.score).band === f;
}

function Chip({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 px-1.5 py-[1px] text-[0.66rem] font-bold uppercase tracking-[0.05em] ${TONE_CLASS[tone].chip}`}>{children}</span>;
}

/** Flat score cell: number in Panchang with a fill bar along the bottom edge. */
function ScoreCell({ score, stale }: { score: number | null; stale: boolean }) {
  const s = signalStrength(score);
  const fill = stale ? "bg-rose-600" : s.band === "hot" ? "bg-emerald-600" : s.band === "warm" ? "bg-amber-500" : "bg-slate-400";
  return (
    <div className="w-12 shrink-0 border border-slate-300 bg-white" title={stale ? "Last scan failed" : `Signal strength: ${s.label}${score !== null ? ` (${score}/100)` : ""}`}>
      <div className="grid h-8 place-items-center font-display text-[0.95rem] font-semibold text-slate-900">{stale ? "!" : score ?? "–"}</div>
      <div className="h-1 bg-slate-100"><div className={`h-full ${fill}`} style={{ width: `${stale ? 100 : Math.min(100, score ?? 0)}%` }} /></div>
    </div>
  );
}

function InvestorCard({ r, href, draggable, dragging, onDragStart, onDragEnd }: {
  r: BoardRow; href: string; draggable: boolean; dragging: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void;
}) {
  const a = formatAction(r.action, r.bucket);
  const s = cleanSummary(r.summary);
  const stale = r.bucket === "stale";
  const hot = !stale && signalStrength(r.score).band === "hot";
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative shrink-0 animate-rise border bg-white p-3.5 transition-[transform,box-shadow,border-color] hover:-translate-x-px hover:-translate-y-px hover:border-slate-900 hover:shadow-lift ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "opacity-40" : ""} border-slate-300`}
    >
      {hot && <span className="absolute inset-y-0 left-0 w-[3px] grad-cherry" />}
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center font-display text-[0.72rem] font-bold" style={avatarStyle(r.firm)}>{initials(r.firm)}</span>
        <div className="min-w-0 flex-1">
          <Link href={href} draggable={false} className="block truncate text-[0.95rem] font-bold text-slate-900 no-underline hover:text-indigo-700 hover:no-underline">{r.firm}</Link>
          <div className="truncate text-xs text-slate-500">{r.person ?? "Firm-level contact"}</div>
        </div>
        <ScoreCell score={r.score} stale={stale} />
      </div>

      {s.text ? (
        <p className={`mt-3 line-clamp-2 text-[0.85rem] leading-snug ${s.quiet ? "text-slate-400" : "text-slate-700"}`}>{s.text}{s.extra > 0 && <span className="text-slate-400"> · +{s.extra} more</span>}</p>
      ) : (
        <p className="mt-3 text-[0.85rem] text-slate-400">{stale ? "Waiting for a successful refresh." : "Not scanned yet."}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Chip tone={a.tone} title={a.hint}>{a.label}</Chip>
        {r.relState && <Chip tone={r.relState.confirmed ? "info" : "muted"} title={r.relState.confirmed ? "You confirmed this" : "Detected from email. Confirm it in Conversations."}>{STATE_LABEL[r.relState.state as RelationshipState]}{r.relState.confirmed ? "" : "?"}</Chip>}
        {r.rulesOnly && <Chip tone="muted" title="A limited check was used for this investor">Basic scan</Chip>}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2.5 text-[0.72rem] text-slate-500">
        {r.source ? (
          <a href={r.source.url} target="_blank" rel="noopener noreferrer" draggable={false} className="inline-flex max-w-[60%] items-center gap-1 truncate font-semibold text-slate-500 no-underline hover:text-indigo-700 hover:no-underline"><Icon name="link" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{r.source.domain}</span></a>
        ) : <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{r.lastSignal ? `Last signal ${timeAgo(r.lastSignal)}` : "No signal yet"}</span>}
        <span title="How well their thesis matches yours">FIT <b className="text-slate-800">{r.fit}</b></span>
      </div>
    </article>
  );
}
export default function Board({ rows, editable, detailBase, initialQuery = "" }: { rows: BoardRow[]; editable: boolean; detailBase: string; initialQuery?: string }) {
  const router = useRouter();
  const [data, setData] = useState(rows);
  const [q, setQ] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("score");
  const [view, setView] = useState<"board" | "list">("board");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.filter((r) => matches(r, filter) && (!needle || `${r.firm} ${r.person ?? ""}`.toLowerCase().includes(needle)));
    const key = (r: BoardRow) => (sort === "name" ? 0 : sort === "recent" ? (r.lastSignal ? new Date(r.lastSignal).getTime() : 0) : (r.score ?? -1));
    return [...list].sort((a, b) => (sort === "name" ? a.firm.localeCompare(b.firm) : key(b) - key(a)));
  }, [data, q, filter, sort]);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, data.filter((r) => matches(r, f.key)).length])), [data]);

  const flash = (text: string, bad = false) => { setToast({ text, bad }); setTimeout(() => setToast(null), 3200); };

  async function move(id: string, stage: string) {
    const prev = data.find((r) => r.id === id);
    if (!prev || prev.stage === stage) return;
    setData((d) => d.map((r) => (r.id === id ? { ...r, stage } : r)));
    try {
      const res = await fetch("/api/investors/status", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-token": "open" }, body: JSON.stringify({ vc_id: id, status: stage }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not move");
      flash(`${prev.firm} moved to ${STAGES.find((s) => s.key === stage)?.title}`);
      router.refresh();
    } catch (e) {
      setData((d) => d.map((r) => (r.id === id ? { ...r, stage: prev.stage } : r)));
      flash((e as Error).message === "unauthorized" ? "Sign in to move investors" : (e as Error).message, true);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[16rem]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" className="h-4 w-4" /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter investors" aria-label="Filter investors" className="!pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Signal filter">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`border px-3 py-1.5 text-[0.8rem] font-semibold transition ${filter === f.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-900"}`}>
              {f.label} <span className={filter === f.key ? "text-slate-300" : "text-slate-400"}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-2 text-[0.8rem] font-semibold text-slate-500">Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="!w-auto !py-1.5">
              <option value="score">Signal strength</option><option value="recent">Latest signal</option><option value="name">Name A–Z</option>
            </select>
          </label>
          <div className="flex border border-slate-300 bg-white">
            {(["board", "list"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-label={`${v} view`} className={`grid h-9 w-9 place-items-center ${view === v ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}><Icon name={v === "board" ? "grid" : "list"} className="h-4 w-4" /></button>
            ))}
          </div>
        </div>
      </div>

      {view === "board" ? (
        <div className="scroll-thin -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-4 lg:-mx-8 lg:px-8 xl:grid xl:grid-cols-4 xl:overflow-visible">
          {STAGES.map((st) => {
            const col = visible.filter((r) => r.stage === st.key);
            const isOver = over === st.key && dragId !== null;
            return (
              <section
                key={st.key}
                onDragOver={editable ? (e) => { e.preventDefault(); setOver(st.key); } : undefined}
                onDragLeave={editable ? () => setOver((o) => (o === st.key ? null : o)) : undefined}
                onDrop={editable ? (e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; setOver(null); setDragId(null); if (id) move(id, st.key); } : undefined}
                className={`flex min-h-[18rem] w-[19.5rem] shrink-0 snap-start flex-col border p-2.5 transition xl:w-auto ${isOver ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white/55"}`}
              >
                <header title={st.hint} className="mb-2.5 flex items-center gap-2 border-b border-slate-900 px-1.5 pb-2.5 pt-1">
                  <span className={`h-2.5 w-2.5 ${TONE_CLASS[st.tone].dot}`} />
                  <h2>{st.title}</h2>
                  <span className="border border-slate-300 bg-white px-1.5 text-[0.72rem] font-bold leading-[1.2rem] text-slate-700">{col.length}</span>
                  
                </header>
                <div className="scroll-thin flex flex-1 flex-col gap-2.5 overflow-y-auto xl:max-h-[calc(100vh-17rem)]">
                  {col.map((r) => (
                    <InvestorCard key={r.id} r={r} href={`${detailBase}/${r.id}`} draggable={editable} dragging={dragId === r.id}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.id); e.dataTransfer.effectAllowed = "move"; setDragId(r.id); }} onDragEnd={() => { setDragId(null); setOver(null); }} />
                  ))}
                  {!col.length && <div className="grid flex-1 place-items-center border border-dashed border-slate-300 p-6 text-center text-[0.8rem] text-slate-400">{editable ? "Drop an investor here" : "Nothing here"}</div>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-[0.88rem]">
            <thead><tr className="border-b border-slate-900 text-[0.68rem] uppercase tracking-[0.1em] text-slate-500">
              <th className="px-4 py-3">Investor</th><th className="px-3 py-3">Stage</th><th className="px-3 py-3">Signal</th><th className="px-3 py-3">Next step</th><th className="px-3 py-3">Latest</th><th className="px-3 py-3 text-right">Fit</th>
            </tr></thead>
            <tbody>
              {visible.map((r) => {
                const a = formatAction(r.action, r.bucket); const sg = signalStrength(r.score); const stale = r.bucket === "stale";
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center font-display text-[0.66rem] font-bold" style={avatarStyle(r.firm)}>{initials(r.firm)}</span>
                      <div><Link href={`${detailBase}/${r.id}`} className="font-bold text-slate-900 no-underline hover:text-indigo-700 hover:no-underline">{r.firm}</Link><div className="text-xs text-slate-500">{r.person ?? ""}</div></div></div></td>
                    <td className="px-3 py-3">{STAGES.find((s) => s.key === r.stage)?.title}</td>
                    <td className="px-3 py-3"><Chip tone={stale ? "alert" : sg.tone}>{stale ? "Needs refresh" : sg.label}{!stale && r.score !== null ? ` · ${r.score}` : ""}</Chip></td>
                    <td className="px-3 py-3"><Chip tone={a.tone} title={a.hint}>{a.label}</Chip></td>
                    <td className="max-w-md px-3 py-3 text-slate-600"><span className="line-clamp-1">{cleanSummary(r.summary).text || "—"}</span></td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{r.fit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!visible.length && <p className="p-8 text-center text-slate-400">No investors match.</p>}
        </div>
      )}

      {editable && view === "board" && <p className="mt-1 text-center text-xs text-slate-400">Drag a card to change its stage.</p>}
      {toast && <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 border border-slate-900 px-4 py-2 text-sm font-semibold text-white ${toast.bad ? "bg-rose-700" : "grad-cherry"}`}>{toast.text}</div>}
    </div>
  );
}
