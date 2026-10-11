import Link from "next/link";
import RefreshControls from "@/components/RefreshControls";
import { getPipeline, type PipelineRow } from "@/lib/db/read";
import { latestRun } from "@/lib/db/store";
import { db } from "@/lib/db/client";
import { BUCKET_META, BUCKET_ORDER, bandOfScore, type Bucket } from "@/lib/view/buckets";
import { fmtDate, fmtDateTime, STATUS_LABEL } from "@/lib/view/format";

export const dynamic = "force-dynamic";

const BAND_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-600",
  none: "bg-slate-100 text-slate-400",
};

function ScoreBadge({ score }: { score: number | null }) {
  const b = bandOfScore(score);
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[b]}`}>{score ?? "–"} {b !== "none" && b}</span>;
}

function Card({ r }: { r: PipelineRow }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={`/vc/${r.id}`} className="font-semibold">{r.firm_name}</Link>
          {r.investor_name !== r.firm_name && <span className="text-sm text-slate-500"> · {r.investor_name}</span>}
          <div className="text-xs text-slate-500">{STATUS_LABEL[r.contact_status] ?? r.contact_status}</div>
        </div>
        <ScoreBadge score={r.follow_up_score} />
      </div>
      {r.signal_summary && <p className="mt-2 text-sm text-slate-700">{r.signal_summary}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        {r.top_signal && (
          <a href={r.top_signal.source_url} target="_blank" rel="noopener noreferrer">
            Source: {r.top_signal.source_domain} · {fmtDate(r.top_signal.date)}
          </a>
        )}
        <span>Last signal: {fmtDate(r.last_signal_date)}</span>
        {r.latest_scan_mode === "rules_only" && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800">rules-only</span>}
      </div>
      {r.recommended_action && <div className="mt-2 text-xs font-medium text-slate-800">{r.recommended_action}</div>}
      {r.bucket === "stale" && (
        <div className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-800">
          DATA STALE: refresh failed, not the same as quiet. {r.latest_item_error ? `(${r.latest_item_error.slice(0, 140)})` : ""}
        </div>
      )}
    </div>
  );
}

function SetupNeeded({ missing, error }: { missing?: string[]; error?: string }) {
  return (
    <main className="mx-auto max-w-2xl rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm">
      <h1 className="text-xl font-bold">Almost there: connect the database</h1>
      {missing && <p className="mt-2">Missing in <code>.env.local</code>: <b>{missing.join(", ")}</b>.</p>}
      {error && <p className="mt-2 text-rose-800">Database error: {error}</p>}
      <ol className="mt-4 list-decimal space-y-1 pl-5">
        <li>Create a free Supabase project.</li>
        <li>In its SQL editor run <code>supabase/migrations/001_schema.sql</code>, then <code>002_safe_update.sql</code>, then <code>003_seed_sources.sql</code>.</li>
        <li>Copy the project URL and service-role key into <code>.env.local</code>, then restart the dev server.</li>
        <li>Import the VCs: <code>npm run seed</code>.</li>
      </ol>
    </main>
  );
}

export default async function Home({ searchParams }: { searchParams: Promise<{ view?: string; band?: string; status?: string }> }) {
  const sp = await searchParams;
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length) return <SetupNeeded missing={missing} />;
  let rows: PipelineRow[];
  let run: Awaited<ReturnType<typeof latestRun>>;
  try {
    rows = await getPipeline(false);
    run = await latestRun();
  } catch (e) {
    return <SetupNeeded error={(e as Error).message} />;
  }

  let refreshed = 0, modeLabel = "gemini", stalled = false;
  if (run) {
    const { data: items } = await db().from("signal_run_items").select("status, scan_mode, started_at, finished_at").eq("run_id", run.id);
    refreshed = (items ?? []).filter((i) => i.status === "success" || i.status === "no_verified_signal").length;
    if ((items ?? []).some((i) => i.scan_mode === "rules_only")) modeLabel = "rules-only (some VCs)";
    const last = Math.max(new Date(run.started_at).getTime(), ...(items ?? []).map((i) => new Date(i.finished_at ?? i.started_at).getTime()));
    stalled = run.status === "running" && Date.now() - last > 3 * 60_000;
  }

  const table = sp.view === "table";
  const filtered = rows.filter((r) => (!sp.band || bandOfScore(r.follow_up_score) === sp.band) && (!sp.status || r.contact_status === sp.status));
  const byBucket = new Map<Bucket, PipelineRow[]>();
  for (const r of rows) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r]);

  return (
    <main>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">This week</h1>
          <p className="text-sm text-slate-600">Which VCs are worth contacting now, and why. Evidence from the last 30 days.</p>
        </div>
        <RefreshControls stalled={stalled} runId={run?.id ?? null} />
      </header>

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        {run ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span>Last run: <b>{fmtDateTime(run.started_at)}</b> ({run.trigger_type})</span>
            <span>Status: <b>{run.status}</b></span>
            <span>{refreshed} of {run.vcs_targeted} VCs refreshed</span>
            <span>LLM mode: <b>{modeLabel}</b></span>
            {run.error_summary && <span className="text-rose-700">{run.error_summary}</span>}
          </div>
        ) : (
          <span>No scan has run yet. Use Refresh (admin token) to run the first one.</span>
        )}
      </section>

      <nav className="mb-4 flex gap-3 text-sm">
        <Link href="/" className={!table ? "font-semibold" : ""}>Buckets</Link>
        <Link href="/?view=table" className={table ? "font-semibold" : ""}>Table</Link>
      </nav>

      {!table &&
        BUCKET_ORDER.map((b) => {
          const list = byBucket.get(b) ?? [];
          if (!list.length) return null;
          return (
            <section key={b} className="mb-8">
              <h2 className="text-lg font-semibold">{BUCKET_META[b].title} <span className="text-sm font-normal text-slate-500">({list.length})</span></h2>
              <p className="mb-3 text-xs text-slate-500">{BUCKET_META[b].blurb}</p>
              <div className="grid gap-3 md:grid-cols-2">{list.map((r) => <Card key={r.id} r={r} />)}</div>
            </section>
          );
        })}

      {table && (
        <section>
          <form className="mb-3 flex flex-wrap gap-2 text-sm">
            <input type="hidden" name="view" value="table" />
            <select name="band" defaultValue={sp.band ?? ""} className="rounded border px-2 py-1">
              <option value="">All bands</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
            <select name="status" defaultValue={sp.status ?? ""} className="rounded border px-2 py-1">
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="rounded bg-slate-800 px-3 py-1 text-white">Filter</button>
          </form>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-2">Investor / firm</th><th className="p-2">Score</th><th className="p-2">Last signal</th>
                  <th className="p-2">Summary</th><th className="p-2">Action</th><th className="p-2">Status</th><th className="p-2">Last good scan</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="p-2"><Link href={`/vc/${r.id}`}>{r.firm_name}</Link></td>
                    <td className="p-2"><ScoreBadge score={r.follow_up_score} /></td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.last_signal_date)}</td>
                    <td className="p-2 max-w-md">{r.signal_summary ?? "–"}{r.top_signal && <> <a href={r.top_signal.source_url} target="_blank" rel="noopener noreferrer">[source]</a></>}</td>
                    <td className="p-2">{r.bucket === "stale" ? "DATA STALE: refresh failed, not the same as quiet" : r.recommended_action ?? "–"}</td>
                    <td className="p-2 whitespace-nowrap">{STATUS_LABEL[r.contact_status] ?? r.contact_status}</td>
                    <td className="p-2 whitespace-nowrap">{fmtDate(r.last_success_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="mt-10 text-xs text-slate-500">
        &quot;Quiet&quot; means no qualifying signal was found in the sources the system can search (LangSearch, Google News RSS, known feeds).
        It is not proof of inactivity. Scores are deterministic and based on public evidence only.
      </footer>
    </main>
  );
}
