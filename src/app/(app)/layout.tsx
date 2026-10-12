import { cookies } from "next/headers";
import { LoginForm } from "@/components/ui";
import AppShell from "@/components/shell/AppShell";
import { hasAdminSession, SESSION_COOKIE, workspaceOpen } from "@/lib/auth";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Visitor-facing fallback. The technical reason is logged on the server, never shown on screen. */
function Unavailable() {
  return (
    <main className="blueprint grid min-h-screen place-items-center p-6">
      <div className="card max-w-md p-8">
        <h1>We&apos;ll be right back</h1>
        <div className="rule-cherry my-4" />
        <p className="text-[0.95rem] leading-relaxed text-slate-600">Something went wrong while loading your investors. Please try again in a moment.</p>
        <a href="/" className="btn-primary mt-5 no-underline hover:no-underline">Try again</a>
      </div>
    </main>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const authed = workspaceOpen() || hasAdminSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!authed) return <LoginForm />;

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[raise] missing environment variables: ${missing.join(", ")}`);
    return <Unavailable />;
  }

  // One retry: transient errors (clock skew, cold connection) usually clear on their own.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await db().from("vc_pipeline").select("id", { head: true, count: "exact" }).limit(1);
    if (!error) return <AppShell>{children}</AppShell>;
    if (attempt === 1) console.error(`[raise] database unavailable: ${error.message}`);
    else await new Promise((r) => setTimeout(r, 1500));
  }
  return <Unavailable />;
}
