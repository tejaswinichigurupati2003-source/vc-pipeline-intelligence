"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/shell/Icon";
import { TypedHint } from "./LiveBits";
import { postJson } from "./ui";

export interface PaletteInvestor { id: string; firm: string; person: string | null }
export interface PalettePage { href: string; label: string; hint: string; icon: IconName }

type Item =
  | { kind: "ask"; key: string }
  | { kind: "page"; key: string; page: PalettePage }
  | { kind: "investor"; key: string; inv: PaletteInvestor };

interface Msg { role: "user" | "assistant"; text: string; investors?: { id: string; firm: string }[]; error?: boolean }

const SUGGESTIONS = ["Who should I email this week?", "Why is the top investor ranked first?", "Which investors are quiet, and why?", "Who needs a follow-up?"];

/** Search bar, command palette (Ctrl or Cmd + K) and the "ask about your pipeline" assistant. */
export default function CommandCenter({ investors, pages }: { investors: PaletteInvestor[]; pages: PalettePage[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<"palette" | "chat" | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const items: Item[] = useMemo(() => {
    const n = q.trim().toLowerCase();
    const out: Item[] = [{ kind: "ask", key: "ask" }];
    const ps = pages.filter((p) => !n || `${p.label} ${p.hint}`.toLowerCase().includes(n));
    const is = investors.filter((i) => n && `${i.firm} ${i.person ?? ""}`.toLowerCase().includes(n)).slice(0, 6);
    out.push(...is.map((inv): Item => ({ kind: "investor", key: `i${inv.id}`, inv })), ...ps.slice(0, n ? 5 : 8).map((page): Item => ({ kind: "page", key: `p${page.href}`, page })));
    return out;
  }, [q, investors, pages]);

  const close = useCallback(() => { setOpen(null); setQ(""); setSel(0); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => (o === "palette" ? null : "palette")); }
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => { if (open === "palette") setTimeout(() => inputRef.current?.focus(), 30); if (open === "chat") setTimeout(() => chatRef.current?.focus(), 30); }, [open]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setOpen("chat"); setQ(""); setDraft("");
    setMsgs((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await postJson("/api/assistant", { question: text });
      setMsgs((m) => [...m, { role: "assistant", text: r.answer, investors: r.investors }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: (e as Error).message || "Something went wrong. Please try again.", error: true }]);
    }
    setBusy(false);
  }

  function choose(it: Item) {
    if (it.kind === "ask") return q.trim() ? ask(q) : setOpen("chat");
    close();
    router.push(it.kind === "page" ? it.page.href : `/investors/${it.inv.id}`);
  }

  return (
    <>
      <button onClick={() => setOpen("palette")} className="group relative ml-auto flex w-full min-w-0 max-w-[17rem] flex-1 items-center gap-2.5 border border-slate-300 bg-white px-3 py-2 text-left text-[0.9rem] text-slate-400 transition hover:border-slate-900 hover:shadow-lift" aria-label="Search or ask">
        <Icon name="search" className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate"><TypedHint prefix="Search, or ask: " phrases={SUGGESTIONS} /></span>
        <kbd className="hidden border border-slate-300 bg-slate-50 px-1.5 text-[0.68rem] font-semibold text-slate-500 sm:inline">Ctrl K</kbd>
      </button>

      {mounted && createPortal(
        <>
      {!open && (
        <button onClick={() => setOpen("chat")} aria-label="Ask about your pipeline" className="group fixed bottom-5 right-5 z-40 flex items-center gap-2 border border-slate-900 px-4 py-3 text-[0.88rem] font-semibold text-white shadow-lift transition hover:-translate-x-px hover:-translate-y-px grad-cherry">
          <Icon name="chat" className="h-[18px] w-[18px]" /><span className="hidden sm:inline">Ask about your pipeline</span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 px-4 pt-[10vh] backdrop-blur-[3px] animate-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          {open === "palette" ? (
            <div role="dialog" aria-label="Search" className="w-full max-w-2xl animate-pop border border-slate-900 bg-white shadow-2xl">
              <div className="flex items-center gap-3 border-b border-slate-200 px-4">
                <Icon name="search" className="h-5 w-5 text-slate-400" />
                <input
                  ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search investors and pages, or ask a question…" aria-label="Search"
                  className="!border-0 !px-0 !py-4 !text-[1.05rem] !outline-none focus:!outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
                    else if (e.key === "Enter") { e.preventDefault(); const it = items[sel]; if (it) choose(it); }
                  }}
                />
                <kbd className="border border-slate-300 bg-slate-50 px-1.5 text-[0.68rem] font-semibold text-slate-500">Esc</kbd>
              </div>
              <ul className="scroll-thin max-h-[60vh] overflow-y-auto p-2">
                {items.map((it, i) => (
                  <li key={it.key}>
                    <button onMouseEnter={() => setSel(i)} onClick={() => choose(it)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${i === sel ? "bg-indigo-50" : ""}`}>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center border ${it.kind === "ask" ? "border-indigo-700 grad-cherry text-white" : "border-slate-300 bg-white text-slate-500"}`}>
                        <Icon name={it.kind === "ask" ? "chat" : it.kind === "page" ? it.page.icon : "board"} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.95rem] font-semibold text-slate-900">
                          {it.kind === "ask" ? (q.trim() ? `Ask: “${q.trim()}”` : "Ask the assistant") : it.kind === "page" ? it.page.label : it.inv.firm}
                        </span>
                        <span className="block truncate text-[0.8rem] text-slate-500">
                          {it.kind === "ask" ? "Gemini answers from your pipeline data" : it.kind === "page" ? it.page.hint : it.inv.person ?? "Investor"}
                        </span>
                      </span>
                      {i === sel && <span className="text-[0.7rem] font-semibold text-slate-400">{it.kind === "ask" ? "Enter to ask" : "Enter to open"}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-200 px-4 py-2 text-[0.72rem] text-slate-500">Up and down to move · Enter to open or ask · Esc to close</div>
            </div>
          ) : (
            <div role="dialog" aria-label="Ask about your pipeline" className="flex max-h-[80vh] w-full max-w-xl animate-pop flex-col border border-slate-900 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="!text-[0.95rem]">Ask about your pipeline</h2>
                  <p className="mt-1 text-[0.82rem] leading-snug text-slate-500">Answers come from your data only, written by Gemini Flash. It cannot send mail or see your private notes.</p>
                </div>
                <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-900"><Icon name="close" /></button>
              </div>
              <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {!msgs.length && (
                  <>
                    <p className="text-[0.9rem] text-slate-500">Ask in plain words. For example:</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)} className="border border-slate-300 bg-white px-3 py-1.5 text-[0.85rem] font-medium text-slate-800 transition hover:border-indigo-700 hover:bg-indigo-50">{s}</button>)}
                    </div>
                  </>
                )}
                {msgs.map((m, i) => (
                  <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                    <div className={`max-w-[92%] px-3.5 py-2.5 text-[0.9rem] leading-relaxed ${m.role === "user" ? "bg-slate-900 text-white" : m.error ? "border border-rose-300 bg-rose-50 text-rose-800" : "border border-slate-200 bg-slate-50 text-slate-800"}`}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {!!m.investors?.length && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {m.investors.map((v) => <Link key={v.id} href={`/investors/${v.id}`} onClick={close} className="border border-indigo-300 bg-white px-2 py-0.5 text-[0.76rem] font-semibold text-indigo-800 no-underline hover:bg-indigo-50 hover:no-underline">{v.firm}</Link>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {busy && <div className="flex items-center gap-1.5 text-slate-400" aria-label="Thinking"><span className="dot" /><span className="dot [animation-delay:150ms]" /><span className="dot [animation-delay:300ms]" /></div>}
                <div ref={endRef} />
              </div>
              <form className="flex gap-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); ask(draft); }}>
                <input ref={chatRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} placeholder="Ask about an investor or this week" aria-label="Your question" />
                <button disabled={busy || draft.trim().length < 2} className="btn-primary !px-3" aria-label="Send"><Icon name="arrowUp" className="h-4 w-4" /></button>
              </form>
            </div>
          )}
        </div>
      )}
        </>,
        document.body,
      )}
    </>
  );
}
