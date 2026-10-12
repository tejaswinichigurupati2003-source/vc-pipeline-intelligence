import { cookies } from "next/headers";
import { LoginForm } from "@/components/ui";
import AppShell from "@/components/shell/AppShell";
import { hasAdminSession, SESSION_COOKIE, workspaceOpen } from "@/lib/auth";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

function Problem({ missing, error }: { missing?: string[]; error?: string }) {
  return (
    <main className="blueprint grid min-h-screen place-items-center p-6">
      <div className="card max-w-xl p-8 text-[0.95rem]">
        {missing ? (
          <>
            <h1>Connect your database</h1>
            <div className="rule-cherry my-4" />
            <p className="text-slate-600">Missing in <code>.env.local</code>: <b>{missing.join(", ")}</b>.</p>
            <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-slate-600">
              <li>Create a free Supabase project and run <code>supabase/migrations/001</code> to <code>006</code> (or <code>npm run migrate</code>).</li>
              <li>Copy the project URL and secret key into <code>.env.local</code>, then restart the dev server.</li>
              <li>Import the investors: <code>npm run seed</code>.</li>
            </ol>
          </>
        ) : (
          <>
            <h1>Can&apos;t reach the database</h1>
            <div className="rule-cherry my-4" />
            <p className="text-rose-700">{error}</p>
            <p className="mt-2 text-slate-600">Your data is safe; this is usually temporary, so reload in a moment. &quot;JWT issued at future&quot; means this computer&apos;s clock and Supabase&apos;s differ: sync the Windows clock (Settings, Time &amp; language, Sync now).</p>
          </>
        )}
      </div>
    </main>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const authed = workspaceOpen() || hasAdminSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!authed) return <LoginForm />;

  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) return <Problem missing={missing} />;

  // One retry: transient errors (clock skew, cold connection) usually clear on their own.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await db().from("vc_pipeline").select("id", { head: true, count: "exact" }).limit(1);
    if (!error) return <AppShell>{children}</AppShell>;
    if (attempt === 1) return <Problem error={error.message} />;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return <Problem error="Unknown error" />;
}
