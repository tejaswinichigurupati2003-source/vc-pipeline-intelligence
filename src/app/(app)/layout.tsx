import { cookies } from "next/headers";
import { LoginForm } from "@/components/ui";
import AppShell from "@/components/shell/AppShell";
import Unavailable from "@/components/shell/Unavailable";
import { hasAdminSession, SESSION_COOKIE, workspaceOpen } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const authed = workspaceOpen() || hasAdminSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!authed) return <LoginForm />;

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[raise] missing environment variables: ${missing.join(", ")}`);
    return <Unavailable />;
  }
  // The shell loads its own data (with a retry); a failure there is caught by error.tsx.
  return <AppShell>{children}</AppShell>;
}
