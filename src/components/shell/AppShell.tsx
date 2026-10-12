import RefreshControls from "@/components/RefreshControls";
import { LogoutButton } from "@/components/ui";
import { workspaceOpen } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { latestRun } from "@/lib/db/store";
import { avatarStyle, initials, timeAgo } from "@/lib/view/labels";
import Icon from "./Icon";
import Sidebar, { type NavGroup } from "./Sidebar";

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

function Meter({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  return (
    <div className="min-w-[10rem]" title={`${label}: ${value} of ${target}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-slate-500"><span>{label}</span><span className="text-slate-900">{value}<span className="text-slate-400">/{target}</span></span></div>
      <div className="h-2 border border-slate-900 bg-white"><div className="h-full grad-cherry" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** The one app frame: fixed sidebar, top bar with round progress, search and refresh. */
export default async function AppShell({ children }: { children: React.ReactNode }) {
  const [{ data: statuses }, run, { data: settingsRows }, proposed] = await Promise.all([
    db().from("vc_pipeline").select("contact_status"),
    latestRun(),
    db().from("app_settings").select("key, value"),
    db().from("commitments").select("id", { count: "exact", head: true }).eq("status", "proposed"),
  ]);
  const settings = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value])) as Record<string, string>;
  const all = statuses ?? [];
  const contacted = all.filter((r) => r.contact_status !== "yet_to_reach_out").length;
  const active = all.filter((r) => r.contact_status === "in_conversation").length;

  const groups: NavGroup[] = [
    { title: "Overview", items: [{ href: "/", label: "Today", icon: "today" }, { href: "/round", label: "Round overview", icon: "chart" }] },
    { title: "Fundraising", items: [
      { href: "/investors", label: "Investors", icon: "board", badge: all.length },
      { href: "/signals", label: "Market signals", icon: "signal" },
      { href: "/conversations", label: "Conversations", icon: "chat", badge: proposed.count || null },
      { href: "/intros", label: "Warm intros", icon: "intro" },
    ] },
    { title: "Prepare", items: [{ href: "/data-room", label: "Data room", icon: "folder" }] },
    { title: "Settings", items: [{ href: "/integrations", label: "Integrations", icon: "plug" }, { href: "/import", label: "Import & export", icon: "upload" }] },
  ];

  const open = workspaceOpen();
  const name = settings.founder_name || "Founder";
  const failed = run?.status === "failed" || run?.status === "partial";
  const stalled = run?.status === "running" && Date.now() - new Date(run.started_at).getTime() > 3 * 60_000;

  return (
    <div className="blueprint min-h-screen">
      <Sidebar
        groups={groups}
        footer={
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center text-sm font-bold" style={avatarStyle(name)}>{initials(name)}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[0.88rem] font-semibold text-slate-900">{name}</div>
              <div className="truncate text-xs text-slate-500">{settings.company_name || "Add your company in Data room"}</div>
            </div>
            {!open && <LogoutButton />}
          </div>
        }
      />
      <div className="lg:pl-[15.5rem]">
        <header className="sticky top-0 z-10 border-b border-slate-900 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2 pl-16 lg:px-8">
            <div className="hidden xl:block">
              <div className="font-display text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-slate-900">{settings.company_name ? `${settings.company_name} · Seed` : "Seed round"}</div>
              <div className="text-xs text-slate-500">{all.length} investors tracked</div>
            </div>
            <div className="hidden gap-6 md:flex">
              <Meter label="Contacted" value={contacted} target={num(settings.round_target_investors, 40)} />
              <Meter label="In conversation" value={active} target={num(settings.round_target_conversations, 8)} />
            </div>
            <form action="/investors" className="relative ml-auto w-full max-w-xs flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Icon name="search" className="h-4 w-4" /></span>
              <input name="q" placeholder="Search investors" aria-label="Search investors" className="!pl-9" />
            </form>
            <div className="flex items-center gap-4">
              <div className="hidden text-right text-xs leading-tight text-slate-500 sm:block" title={run ? `Run ${run.status}` : undefined}>
                <div className={`font-semibold ${failed ? "text-rose-700" : "text-slate-800"}`}>{run ? (failed ? "Last scan incomplete" : run.status === "running" ? "Scanning…" : "Signals up to date") : "No scan yet"}</div>
                <div>{run ? timeAgo(run.finished_at ?? run.started_at) : "Run your first refresh"}</div>
              </div>
              <RefreshControls stalled={stalled} runId={run?.id ?? null} open={open} />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
