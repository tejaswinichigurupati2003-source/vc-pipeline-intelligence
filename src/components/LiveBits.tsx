"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveLine, TickerItem } from "@/lib/insights/live";
import { timeAgo } from "@/lib/view/labels";
import CountUp from "./CountUp";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A line that changes every few seconds. Pauses when the pointer is over it; the dots jump to a line. */
export function LiveInsights({ lines }: { lines: LiveLine[] }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (hold || lines.length < 2 || reduced()) return;
    const t = setTimeout(() => setI((n) => (n + 1) % lines.length), 4800);
    return () => clearTimeout(t);
  }, [i, hold, lines.length]);
  if (!lines.length) return null;
  const l = lines[i % lines.length];
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <span className="inline-flex shrink-0 items-center gap-1.5 border border-white/30 bg-white/10 px-2 py-0.5 text-[0.64rem] font-bold uppercase tracking-[0.14em] text-white">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping bg-emerald-300 opacity-70" /><span className="relative inline-flex h-2 w-2 bg-emerald-300" /></span>Live
      </span>
      <Link key={i} href={l.href} className="animate-slide min-w-0 flex-1 text-[1rem] text-white no-underline hover:underline">
        {l.before && <>{l.before} </>}{l.value !== null && <b className="font-display text-[1.15rem]"><CountUp value={l.value} ms={500} /></b>} {l.after}
      </Link>
      <span className="flex shrink-0 gap-1.5" role="tablist" aria-label="Live insights">
        {lines.map((_, n) => <button key={n} onClick={() => setI(n)} aria-label={`Insight ${n + 1}`} className={`h-1.5 transition-all ${n === i ? "w-5 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`} />)}
      </span>
    </div>
  );
}

/** The newest verified headlines, scrolling. Hover to pause, click to see the evidence. */
export function SignalTicker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  const row = (suffix: string) => items.map((t) => (
    <Link key={`${t.id}${suffix}`} href={t.href} className="inline-flex items-center gap-2 whitespace-nowrap px-5 text-[0.84rem] text-slate-700 no-underline hover:text-indigo-700 hover:no-underline">
      <b className="text-slate-900">{t.firm}</b><span>{t.text}</span><span className="text-slate-400" suppressHydrationWarning>{timeAgo(t.date)}</span><span className="text-slate-300">/</span>
    </Link>
  ));
  return (
    <div className="ticker mb-6 flex items-stretch overflow-hidden border border-slate-300 bg-white" aria-label="Latest verified signals">
      <span className="z-10 flex shrink-0 items-center gap-1.5 border-r border-slate-900 bg-slate-900 px-3 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-white">Latest signals</span>
      <div className="relative flex-1 overflow-hidden py-2.5">
        <div className="ticker-track flex w-max">{row("a")}{row("b")}</div>
      </div>
    </div>
  );
}

/** "5m ago" that keeps itself current without a page reload. */
export function LiveAgo({ iso }: { iso: string | null | undefined }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);
  return <span suppressHydrationWarning>{timeAgo(iso)}</span>;
}

/** Types example questions into the search bar, one after another. Static for reduced-motion users. */
export function TypedHint({ phrases, prefix }: { phrases: string[]; prefix: string }) {
  const [text, setText] = useState(phrases[0] ?? "");
  useEffect(() => {
    if (reduced() || !phrases.length) return;
    let p = 0, c = 0, dir = 1, timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const full = phrases[p];
      c += dir;
      setText(full.slice(0, c));
      if (dir === 1 && c >= full.length) { dir = -1; timer = setTimeout(step, 1800); return; }
      if (dir === -1 && c <= 0) { dir = 1; p = (p + 1) % phrases.length; timer = setTimeout(step, 350); return; }
      timer = setTimeout(step, dir === 1 ? 45 : 22);
    };
    timer = setTimeout(step, 1200);
    return () => clearTimeout(timer);
  }, [phrases]);
  return <span>{prefix}<span className="text-slate-600">{text}</span><span className="caret ml-px inline-block h-[1em] w-px translate-y-[2px] bg-slate-500" /></span>;
}
