import { cache, Suspense } from "react";
import Link from "next/link";
import CommandCenter from "@/components/CommandCenter";
import CountUp from "@/components/CountUp";
import { LiveAgo } from "@/components/LiveBits";
import RefreshControls from "@/components/RefreshControls";
import { LogoutButton } from "@/components/ui";
import { workspaceOpen } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { latestRun } from "@/lib/db/store";
import { avatarStyle, initials } from "@/lib/view/labels";
import Sidebar, { type NavGroup } from "./Sidebar";

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

function Meter({ label, short, value, target, href }: { label: string; short?: string; value: number; target: number; href: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  return (
    <Link href={href} className="block min-w-[6.75rem] no-underline transition hover:-translate-y-px hover:no-underline lg:min-w-[9rem]" title={`${label}: ${value} of ${target}. Click to see them.`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
        <span>{short ? <><span className="lg:hidden">{short}</span><span className="hidden lg:inline">{label}</span></> : label}</span>
        <span className="text-slate-900"><CountUp value={value} /><span className="text-slate-400">/{target}</span></span>
      </div>
      <div className="h-2 border border-slate-900 bg-white"><div className="h-full grad-cherry transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} /></div>
    </Link>
  );
}

const PAGE_HINT: Record<string, string> = {
  "/": "Start here: what to do today", "/round": "Where your round stands against targets", "/investors": "Search and filter every investor",
  "/signals": "Verified public news behind the scores", "/conversations": "Replies and threads from Gmail", "/drafts": "Suggested messages, saved to Gmail",
  "/intros": "Warm paths to investors", "/discover": "New investors that fit your company", "/data-room": "Company facts and documents",
  "/demo": "Watch how the whole thing works", "/integrations": "Connect Gmail and Calendar", "/import": "Bring your investor list in or out",
};

const NAV = (investors?: number, proposed?: number | null): NavGroup[] => [
  { title: "Overview", items: [{ href: "/", label: "Today", icon: "today" }, { href: "/round", label: "Round overview", icon: "chart" }] },
  { title: "Fundraising", items: [
    { href: "/investors", label: "Investors", icon: "board", badge: investors },
    { href: "/signals", label: "Market signals", icon: "signal" },
    { href: "/conversations", label: "Conversations", icon: "chat", badge: proposed || null },
    { href: "/drafts", label: "Drafts", icon: "mail" },
    { href: "/intros", label: "Warm intros", icon: "intro" },
    { href: "/discover", label: "Discover investors", icon: "compass" },
  ] },
  { title: "Prepare", items: [{ href: "/data-room", label: "Data room", icon: "folder" }, { href: "/demo", label: "Demo", icon: "play" }] },
  { title: "Settings", items: [{ href: "/integrations", label: "Integrations", icon: "plug" }, { href: "/import", label: "Import & export", icon: "upload" }] },
];

/** One read per request, shared by the sidebar and the top bar. */
const loadShell = cache(async () => {
  const load = () => Promise.all([
    db().from("vc_pipeline").select("id, firm_name, investor_name, contact_status").order("firm_name"),
    latestRun(),
    db().from("app_settings").select("key, value"),
    db().from("commitments").select("id", { count: "exact", head: true }).eq("status", "proposed"),
  ]);
  let [{ data: statuses, error: e1 }, run, { data: settingsRows, error: e2 }, proposed] = await load();
  if (e1 || e2) {
    // One retry: transient errors (clock skew, cold connection) usually clear on their own.
    await new Promise((r) => setTimeout(r, 1500));
    [{ data: statuses, error: e1 }, run, { data: settingsRows, error: e2 }, proposed] = await load();
    if (e1 || e2) throw new Error(`database unavailable: ${(e1 ?? e2)!.message}`);
  }
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
  return { all: statuses ?? [], run, settings, proposed: proposed.count ?? 0 };
});

function SidebarFooter({ name, company, open }: { name: string; company: string; open: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center text-sm font-bold" style={avatarStyle(name || "Founder")}>{initials(name || "Founder")}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[0.88rem] font-semibold text-slate-900">{name || " "}</div>
        <div className="truncate text-xs text-slate-500">{company || " "}</div>
      </div>
      {!open && <LogoutButton />}
    </div>
  );
}

async function ShellSidebar() {
  const { all, settings, proposed } = await loadShell();
  return (
    <Sidebar
      groups={NAV(all.length, proposed)}
      footer={<SidebarFooter name={settings.founder_name || "Founder"} company={settings.company_name || "Add your company in Data room"} open={workspaceOpen()} />}
    />
  );
}

async function ShellHeader() {
  const { all, run, settings } = await loadShell();
  const contacted = all.filter((r) => r.contact_status !== "yet_to_reach_out").length;
  const active = all.filter((r) => r.contact_status === "in_conversation").length;
  const open = workspaceOpen();
  const failed = run?.status === "failed" || run?.status === "partial";
  const stalled = run?.status === "running" && Date.now() - new Date(run.started_at).getTime() > 3 * 60_000;
  return (
    <>
      <div className="hidden shrink-0 min-[1400px]:block">
        <div className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-slate-900">{settings.company_name ? `${settings.company_name} · Seed` : "Seed round"}</div>
        <div className="text-xs text-slate-500">{all.length} investors tracked</div>
      </div>
      <div className="hidden shrink-0 gap-4 sm:flex lg:gap-6">
        <Meter label="Contacted" value={contacted} target={num(settings.round_target_investors, 40)} href="/investors?stage=contacted" />
        <Meter label="In conversation" short="Active" value={active} target={num(settings.round_target_conversations, 8)} href="/investors?stage=in_conversation" />
      </div>
      <CommandCenter
        investors={all.map((n) => ({ id: n.id, firm: n.firm_name, person: n.investor_name !== n.firm_name ? n.investor_name : null }))}
        pages={NAV().flatMap((g) => g.items).map((i) => ({ href: i.href, label: i.label, hint: PAGE_HINT[i.href] ?? "Open", icon: i.icon }))}
      />
      <div className="flex shrink-0 items-center gap-4">
        <div className="hidden whitespace-nowrap text-right text-xs leading-tight text-slate-500 min-[1280px]:block" title={run ? `Run ${run.status}` : undefined}>
          <div className={`font-semibold ${failed ? "text-rose-700" : "text-slate-800"}`}>{run ? (failed ? "Last scan incomplete" : run.status === "running" ? "Scanning…" : "Signals up to date") : "No scan yet"}</div>
          <div>{run ? <LiveAgo iso={run.finished_at ?? run.started_at} /> : "Run your first refresh"}</div>
        </div>
        <RefreshControls stalled={stalled} runId={run?.id ?? null} open={open} running={run?.status === "running"} />
      </div>
    </>
  );
}

/** Same footprint as the real top bar, so nothing jumps when the data arrives. */
function HeaderFallback() {
  return (
    <>
      <div className="hidden shrink-0 gap-4 sm:flex lg:gap-6" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="min-w-[6.75rem] lg:min-w-[9rem]"><div className="mb-1 h-3 w-16 bg-slate-200" /><div className="h-2 border border-slate-300 bg-white" /></div>
        ))}
      </div>
      <div className="ml-auto h-[2.4rem] w-full min-w-0 max-w-[17rem] flex-1 border border-slate-300 bg-white" aria-hidden />
      <div className="h-[2.4rem] w-[6.5rem] shrink-0 bg-slate-200" aria-hidden />
    </>
  );
}

/**
 * The one app frame. It paints at once with the navigation and an outline of the top bar, then the numbers stream in,
 * so the page never sits blank while the database is read.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="blueprint min-h-screen">
      <Suspense fallback={<Sidebar groups={NAV()} footer={<SidebarFooter name="" company="" open />} />}>
        <ShellSidebar />
      </Suspense>
      <div className="lg:pl-[15.5rem]">
        <header className="sticky top-0 z-10 border-b border-slate-900 bg-white/95 backdrop-blur">
          <div className="flex h-16 flex-nowrap items-center gap-x-5 px-5 pl-16 lg:px-8">
            <Suspense fallback={<HeaderFallback />}>
              <ShellHeader />
            </Suspense>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
