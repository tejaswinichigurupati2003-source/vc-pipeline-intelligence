import Link from "next/link";
import { cookies } from "next/headers";
import { LoginForm, LogoutButton } from "@/components/ui";
import { hasAdminSession, SESSION_COOKIE, workspaceOpen } from "@/lib/auth";

export const dynamic = "force-dynamic";

const NAV = [
  ["/workspace", "Today"], ["/workspace/pipeline", "Pipeline"], ["/workspace/signals", "Signals"], ["/workspace/timeline", "Timeline"],
  ["/workspace/intros", "Intros"], ["/workspace/materials", "Materials"], ["/workspace/round", "Round health"],
  ["/workspace/integrations", "Integrations"], ["/workspace/import", "Import / export"],
] as const;

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const open = workspaceOpen();
  const authed = open || hasAdminSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!authed) return <LoginForm />;
  return (
    <div>
      {open && <p className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-900">Login is switched off (WORKSPACE_AUTH=off): anyone who can open this URL can read your notes and use the connected accounts. Remove that setting to require the admin token again.</p>}
      <nav className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 pb-3 text-sm">
        <Link href="/" className="font-semibold">VC Pipeline</Link>
        {NAV.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        {!open && <span className="ml-auto"><LogoutButton /></span>}
      </nav>
      {children}
    </div>
  );
}
