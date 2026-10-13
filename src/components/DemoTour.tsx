"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import CountUp from "./CountUp";
import Icon, { type IconName } from "./shell/Icon";

export interface TourStats { investors: number; hot: number; warm: number; quiet: number; sources: number; suggestions: number }

const STEPS = (s: TourStats): { title: string; icon: IconName; text: string; href: string; cta: string; facts: [number, string][] }[] => [
  { title: "Scan", icon: "search", href: "/signals", cta: "See the signals", facts: [[s.investors, "investors watched"]],
    text: "Twice a week, and whenever you press Refresh, Raise searches news, firm feeds and each partner's name for every investor on your list. Searches run in parallel, so a full scan takes about a minute and a half." },
  { title: "Verify", icon: "check", href: "/investors", cta: "Open the board", facts: [[s.sources, "verified sources, last 30 days"]],
    text: "Gemini reads each source and classifies it. It never scores. Code then checks the investor is really named, the date is inside the window, and the quote appears word for word in the page. Anything that fails is dropped." },
  { title: "Score", icon: "chart", href: "/investors?filter=hot", cta: "See the hot ones", facts: [[s.hot, "hot"], [s.warm, "warm"], [s.quiet, "quiet"]],
    text: "Verified events become a 0 to 100 strength by a fixed formula: base points, recency, relevance and source quality. Hot is 30 or more, Warm 1 to 29, Quiet 0. Quiet means nothing was found, not that the investor is inactive." },
  { title: "Explain", icon: "list", href: "/investors", cta: "Pick an investor", facts: [],
    text: "Open any investor and 'Why this score' shows every source with its date, the arithmetic behind its points, the exact quote and how it was verified, plus a six-month activity trend and the partners involved." },
  { title: "Act", icon: "mail", href: "/", cta: "Open Today", facts: [],
    text: "Today ranks what to do first. Suggested messages are written from the evidence and saved to Gmail as drafts for you to review. Raise never sends anything. Gmail and Calendar add replies and meetings to each investor." },
  { title: "Grow", icon: "compass", href: "/discover", cta: "Discover investors", facts: [[s.suggestions, "new suggestions waiting"]],
    text: "Every Monday Raise looks for investors that fit your company and aren't on your list yet. Each suggestion comes with a source and a quote. Nothing is added until you say so." },
  { title: "Ask", icon: "chat", href: "/investors", cta: "Open the board", facts: [],
    text: "Press Ctrl K anywhere and ask in plain words: who should I email this week, why is this investor first, who is quiet. Answers come only from your pipeline data." },
];

/** A guided walkthrough with live numbers. Plays on its own, or click any step. */
export default function DemoTour({ stats }: { stats: TourStats }) {
  const steps = STEPS(stats);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setI((n) => (n + 1) % steps.length), 7000);
    return () => clearTimeout(t);
  }, [i, playing, steps.length]);
  const s = steps[i];

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-slate-900">
        {steps.map((st, n) => (
          <button key={st.title} onClick={() => { setI(n); setPlaying(false); }} className={`relative px-2 py-3 text-center text-[0.76rem] font-semibold uppercase tracking-[0.06em] transition ${n === i ? "bg-slate-900 text-white" : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
            <span className="block text-[0.64rem] opacity-60">{n + 1}</span>{st.title}
            {n === i && playing && <span className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-indigo-400" style={{ animation: "grow 7s linear" }} />}
          </button>
        ))}
      </div>
      <div key={i} className="grid animate-pop gap-6 p-6 md:grid-cols-[auto_1fr]">
        <span className="grid h-20 w-20 place-items-center border border-slate-900 grad-cherry text-white"><Icon name={s.icon} className="h-9 w-9" /></span>
        <div>
          <h2 className="!text-[1.1rem]">{i + 1}. {s.title}</h2>
          <p className="mt-2 max-w-2xl text-[0.98rem] leading-relaxed text-slate-700">{s.text}</p>
          {!!s.facts.length && (
            <div className="mt-4 flex flex-wrap gap-3">
              {s.facts.map(([n, label]) => (
                <div key={label} className="border border-slate-300 bg-slate-50 px-4 py-2.5"><div className="font-display text-2xl font-semibold text-slate-900"><CountUp value={n} /></div><div className="text-xs text-slate-500">{label}</div></div>
              ))}
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href={s.href} className="btn-primary no-underline hover:no-underline">{s.cta}</Link>
            <button onClick={() => setPlaying((p) => !p)} className="btn-ghost">{playing ? "Pause" : "Play tour"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
