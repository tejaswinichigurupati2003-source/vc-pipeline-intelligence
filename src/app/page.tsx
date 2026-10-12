import Board from "@/components/Board";
import AppShell from "@/components/shell/AppShell";
import PageHeader from "@/components/shell/PageHeader";
import { getPipeline, type PipelineRow } from "@/lib/db/read";
import { toBoardRows } from "@/lib/view/board";

export const dynamic = "force-dynamic";

function Problem({ missing, error }: { missing?: string[]; error?: string }) {
  return (
    <main className="mx-auto mt-24 max-w-xl card p-7 text-[0.95rem]">
      {missing ? (
        <>
          <h1 className="!text-xl">Connect your database</h1>
          <p className="mt-2 text-slate-600">Missing in <code>.env.local</code>: <b>{missing.join(", ")}</b>.</p>
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-slate-600">
            <li>Create a free Supabase project and run <code>supabase/migrations/001</code> to <code>006</code> (or <code>npm run migrate</code>).</li>
            <li>Copy the project URL and secret key into <code>.env.local</code>, then restart the dev server.</li>
            <li>Import the investors: <code>npm run seed</code>.</li>
          </ol>
        </>
      ) : (
        <>
          <h1 className="!text-xl">Can&apos;t reach the database right now</h1>
          <p className="mt-2 text-rose-700">{error}</p>
          <p className="mt-2 text-slate-600">Your data is safe; this is usually temporary, so reload in a moment. &quot;JWT issued at future&quot; means this computer&apos;s clock and Supabase&apos;s differ: sync the Windows clock (Settings, Time &amp; language, Sync now).</p>
        </>
      )}
    </main>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) return <Problem missing={missing} />;

  let rows: PipelineRow[];
  try {
    rows = await getPipeline(false);
  } catch {
    await new Promise((r) => setTimeout(r, 1500)); // one retry: transient errors (clock skew, cold connection) usually clear
    try {
      rows = await getPipeline(false);
    } catch (e) {
      return <Problem error={(e as Error).message} />;
    }
  }

  return (
    <AppShell mode="public">
      <PageHeader
        eyebrow="Shared view · read only"
        title="Investor pipeline"
        subtitle="Which investors are worth contacting now, and why, based on verified public evidence from the last 30 days. A quiet investor means nothing was found by our searches, not that they are inactive."
      />
      <Board rows={toBoardRows(rows)} editable={false} detailBase="/vc" initialQuery={q ?? ""} />
    </AppShell>
  );
}
