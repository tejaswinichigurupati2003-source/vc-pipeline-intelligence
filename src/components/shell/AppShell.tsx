import Link from "next/link";
import RefreshControls from "@/components/RefreshControls";
import { LogoutButton } from "@/components/ui";
import { workspaceOpen } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { latestRun } from "@/lib/db/store";
import { timeAgo, initials, avatarStyle } from "@/lib/view/labels";
import Icon from "./Icon";
import Sidebar, { type NavGroup } from "./Sidebar";

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

function Meter({ label, value, target, tone }: { label: string; value: number; target: number; tone: "indigo" | "emerald" }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  const fill = tone === "indigo" ? "bg-indigo-500" : "bg-emerald-500";
  return (
    <div className="min-w-[9.5rem]" title={`${label}: ${value} of ${target} (targets are editable in Round overview)`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.72rem] font-semibold text-slate-500"><span>{label}</span><span className="text-slate-900">{value}<span className="text-slate-400"> / {target}</span></span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${fill} transition-all`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/**
 * App frame: fixed sidebar, top bar with round progress, search and refresh. `mode="public"` is the read-only view for
 * the shared URL (no private data, no workspace links except the entry point).
 */
export default async function AppShell({ children, mode = "workspace" }: { children: React.ReactNode; mode?: "workspace" | "public" }) {
  const workspace = mode === "workspace";
  const [{ data: statuses }, run, { data: settingsRows }] = await Promise.all([
    db().from("vc_pipeline").select("contact_status"),
    latestRun(),
    db().from("app_settings").select("key, value"),
  ]);
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
  const all = statuses ?? [];
  const contacted = all.filter((r) => r.contact_status !== "yet_to_reach_out").length;
  const active = all.filter((r) => r.contact_status === "in_conversation").length;
  let proposed = 0;
  if (workspace) proposed = (await db().from("commitments").select("id", { count: "exact", head: true }).eq("status", "proposed")).count ?? 0;

  const groups: NavGroup[] = workspace
    ? [
        { title: "Overview", items: [{ href: "/workspace", label: "Today", icon: "today" }, { href: "/workspace/round", label: "Round overview", icon: "chart" }] },
        { title: "Fundraising", items: [
          { href: "/workspace/pipeline", label: "Investors", icon: "board", badge: all.length },
          { href: "/workspace/signals", label: "Market signals", icon: "signal" },
          { href: "/workspace/timeline", label: "Conversations", icon: "chat", badge: proposed || null },
          { href: "/workspace/intros", label: "Warm intros", icon: "intro" },
        ] },
        { title: "Prepare", items: [{ href: "/workspace/materials", label: "Data room", icon: "folder" }] },
        { title: "Settings", items: [{ href: "/workspace/integrations", label: "Integrations", icon: "plug" }, { href: "/workspace/import", label: "Import & export", icon: "upload" }] },
      ]
    : [{ title: "Shared view", items: [{ href: "/", label: "Investors", icon: "board", badge: all.length }] }];

  const open = workspaceOpen();
  const name = settings.founder_name || "Founder";
  const failed = run?.status === "failed" || run?.status === "partial";
  const stalled = run?.status === "running" && Date.now() - new Date(run.started_at).getTime() > 3 * 60_000;

  return (
    <div className="min-h-screen">
      <Sidebar
        groups={groups}
        footer={workspace ? (
          <div className="space-y-1 text-[0.82rem]">
            <Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 font-semibold text-slate-600 no-underline hover:bg-slate-100 hover:no-underline"><Icon name="link" className="h-4 w-4" />Shared view</Link>
            {!open && <div className="px-3 py-1"><LogoutButton /></div>}
          </div>
        ) : (
          <Link href="/workspace" className="btn-primary w-full no-underline hover:no-underline"><Icon name="board" className="h-4 w-4" />Open workspace</Link>
        )}
      />
      <div className="lg:pl-[15.5rem]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2 pl-16 lg:px-8">
            <div className="hidden xl:block">
              <div className="text-[0.95rem] font-bold text-slate-900">{settings.company_name ? `${settings.company_name} · Seed round` : "Seed round"}</div>
              <div className="text-xs text-slate-500">{all.length} investors tracked</div>
            </div>
            <div className="hidden gap-5 md:flex">
              <Meter label="Investors contacted" value={contacted} target={num(settings.round_target_investors, 40)} tone="indigo" />
              <Meter label="In conversation" value={active} target={num(settings.round_target_conversations, 8)} tone="emerald" />
            </div>
            <form action={workspace ? "/workspace/pipeline" : "/"} className="relative ml-auto w-full max-w-xs flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" className="h-4 w-4" /></span>
              <input name="q" placeholder="Search investors" aria-label="Search investors" className="!rounded-full !bg-slate-100 !pl-9 !shadow-none" />
            </form>
            <div className="flex items-center gap-3">
              <div className="hidden text-right text-xs leading-tight text-slate-500 sm:block" title={run ? `Run ${run.status}` : undefined}>
                <div className={`font-semibold ${failed ? "text-rose-600" : "text-slate-700"}`}>{run ? (failed ? "Last scan incomplete" : run.status === "running" ? "Scanning…" : "Signals up to date") : "No scan yet"}</div>
                <div>{run ? timeAgo(run.finished_at ?? run.started_at) : "Run your first refresh"}</div>
              </div>
              <RefreshControls stalled={stalled} runId={run?.id ?? null} open={open} />
              {workspace && <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold" style={avatarStyle(name)} title={name}>{initials(name)}</span>}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">{children}</div>
        {open && workspace && <p className="mx-5 mb-6 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 lg:mx-8">Login is switched off (<code>WORKSPACE_AUTH=off</code>): anyone who can open this URL can read your notes and use connected accounts.</p>}
      </div>
    </div>
  );
}
