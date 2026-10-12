"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Icon, { type IconName } from "./Icon";

export interface NavItem { href: string; label: string; icon: IconName; badge?: string | number | null }
export interface NavGroup { title: string; items: NavItem[] }

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 no-underline hover:no-underline">
      <span className="relative grid h-9 w-9 place-items-center overflow-hidden border border-slate-900 text-white grad-cherry hatch">
        <svg viewBox="0 0 24 24" className="relative z-10 h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="square"><path d="M5 20V10m7 10V4m7 16v-7" /></svg>
      </span>
      <span className="font-display text-[1.05rem] font-bold uppercase tracking-[0.08em] text-slate-900">Raise</span>
    </Link>
  );
}

export default function Sidebar({ groups, footer }: { groups: NavGroup[]; footer?: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const body = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-slate-900 px-5"><Brand /><button className="lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="close" /></button></div>
      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="eyebrow border-b border-slate-200 px-3 pb-1.5">{g.title}</div>
            <ul className="mt-1.5 space-y-px">
              {g.items.map((it) => {
                const active = isActive(path, it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={`group flex items-center gap-3 border-l-2 px-3 py-2 text-[0.92rem] font-medium no-underline transition hover:no-underline ${active ? "border-indigo-700 bg-indigo-50 text-indigo-800" : "border-transparent text-slate-600 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900"}`}
                    >
                      <span className={active ? "text-indigo-700" : "text-slate-400 group-hover:text-slate-700"}><Icon name={it.icon} /></span>
                      <span className="flex-1">{it.label}</span>
                      {it.badge != null && it.badge !== 0 && <span className={`border px-1.5 text-[0.68rem] font-bold leading-[1.15rem] ${active ? "border-indigo-300 bg-white text-indigo-800" : "border-slate-300 bg-white text-slate-600"}`}>{it.badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer && <div className="border-t border-slate-900 p-3">{footer}</div>}
    </nav>
  );

  return (
    <>
      <button className="fixed left-3 top-3 z-30 grid h-10 w-10 place-items-center border border-slate-900 bg-white lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[15.5rem] border-r border-slate-900 bg-slate-50 lg:block">{body}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-slate-900 bg-slate-50">{body}</aside>
        </div>
      )}
    </>
  );
}
