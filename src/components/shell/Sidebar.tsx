"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import Icon, { type IconName } from "./Icon";

export interface NavItem { href: string; label: string; icon: IconName; badge?: string | number | null }
export interface NavGroup { title: string; items: NavItem[] }

function isActive(path: string, href: string) {
  return href === "/workspace" || href === "/" ? path === href : path === href || path.startsWith(href + "/");
}

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 no-underline hover:no-underline">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-indigo-500 to-indigo-800 text-white shadow-card">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 19V9m7 10V5m7 14v-7" /></svg>
      </span>
      <span className="text-[1.15rem] font-extrabold tracking-tight text-slate-900">Raise</span>
    </Link>
  );
}

export default function Sidebar({ groups, footer }: { groups: NavGroup[]; footer?: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const body = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5"><Brand /><button className="lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="close" /></button></div>
      <div className="scroll-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="eyebrow px-3 pb-1.5">{g.title}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(path, it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[0.92rem] font-semibold no-underline transition hover:no-underline ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
                    >
                      <span className={active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}><Icon name={it.icon} /></span>
                      <span className="flex-1">{it.label}</span>
                      {it.badge != null && it.badge !== 0 && <span className={`rounded-full px-1.5 py-0.5 text-[0.7rem] font-bold ${active ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>{it.badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer && <div className="border-t border-slate-200 p-3">{footer}</div>}
    </nav>
  );

  return (
    <>
      <button className="fixed left-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white shadow-card lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[15.5rem] border-r border-slate-200 bg-white lg:block">{body}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-lift">{body}</aside>
        </div>
      )}
    </>
  );
}
