import { cookies } from "next/headers";
import { LoginForm } from "@/components/ui";
import AppShell from "@/components/shell/AppShell";
import { hasAdminSession, SESSION_COOKIE, workspaceOpen } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const authed = workspaceOpen() || hasAdminSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!authed) return <LoginForm />;
  return <AppShell mode="workspace">{children}</AppShell>;
}
