import { ApiButton, ApiForm, Badge } from "@/components/ui";
import PageHeader from "@/components/shell/PageHeader";
import ScopePicker from "@/components/ScopePicker";
import SyncButton from "@/components/SyncButton";
import { db } from "@/lib/db/client";
import { FIELD_OWNERSHIP, PUSHABLE } from "@/lib/crm/ownership";
import { googleConfigured, GOOGLE_SCOPES, redirectUri } from "@/lib/google/oauth";
import { fmtDateTime } from "@/lib/view/format";

export const dynamic = "force-dynamic";

const friendly = (s: string) => s.replace("https://www.googleapis.com/auth/", "");

export default async function Integrations({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const { data } = await db().from("integration_accounts").select("provider, account_label, scopes, status, config, last_sync_at, last_error, connected_at");
  const acct = (p: string) => (data ?? []).find((a) => a.provider === p);
  const configured = googleConfigured();
  const gm = acct("gmail"), cal = acct("calendar"), hs = acct("hubspot");

  const Card = ({ title, blurb, a, children, provider }: { title: string; blurb: string; a: ReturnType<typeof acct>; children: React.ReactNode; provider: "gmail" | "calendar" | "hubspot" }) => (
    <section className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {a ? <Badge kind={a.status === "connected" ? "verified" : "warn"}>{a.status}</Badge> : <Badge kind="neutral">not connected</Badge>}
      </div>
      <p className="mt-1 text-xs text-slate-600">{blurb}</p>
      {a && (
        <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1 text-xs">
          <dt className="text-slate-500">Account</dt><dd>{a.account_label ?? "n/a"}</dd>
          <dt className="text-slate-500">Permissions</dt><dd>{(a.scopes as string[]).map(friendly).join(", ")}</dd>
          <dt className="text-slate-500">Last sync</dt><dd>{a.last_sync_at ? fmtDateTime(a.last_sync_at) : "never"}</dd>
          <dt className="text-slate-500">Connected</dt><dd>{fmtDateTime(a.connected_at)}</dd>
          {a.last_error && <><dt className="text-rose-700">Last error</dt><dd className="text-rose-700">{a.last_error}</dd></>}
        </dl>
      )}
      {children}
      {a && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          <ApiButton url="/api/integrations/disconnect" body={{ provider, deleteData: false }} label="Disconnect" tone="danger" confirm="Disconnect and revoke access? Data already imported stays until you delete it." />
          <ApiButton url="/api/integrations/disconnect" body={{ provider, deleteData: true }} label="Disconnect and delete imported data" tone="danger" confirm="Disconnect AND delete everything this integration imported? Your own notes are kept." />
        </div>
      )}
    </section>
  );

  return (
    <main>
      <PageHeader title="Integrations" subtitle={<>Each connection asks for the minimum permission it needs, reads only what you select, and can be disconnected or deleted at any time. This app can create Gmail <b>drafts</b>; it has no ability to send.</>} />
      {sp.connected && <p className="mb-3 rounded bg-emerald-50 p-2 text-sm text-emerald-800">Connected {sp.connected}. Choose what is in scope below, then sync.</p>}
      {sp.error && <p className="mb-3 rounded bg-rose-50 p-2 text-sm text-rose-800">Connection failed: {sp.error}</p>}

      {!configured && (
        <section className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <h2 className="font-semibold">Set up Google access first (one time)</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>In Google Cloud Console create a project, enable the <b>Gmail API</b> and <b>Google Calendar API</b>.</li>
            <li>OAuth consent screen: External, Testing mode, add your own Google account as a test user.</li>
            <li>Create an OAuth client (Web application) with this redirect URI: <code>{redirectUri()}</code></li>
            <li>Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code> (and Vercel), set <code>APP_URL</code>, restart.</li>
          </ol>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card provider="gmail" title="Gmail" a={gm} blurb={`Understand relationship state and create DRAFTS. Reads headers, labels and snippets only (no full message bodies) from the labels you pick. Permissions: ${GOOGLE_SCOPES.gmail.filter((s) => s.startsWith("https")).map(friendly).join(" + ")}.`}>
          {!gm ? <a href="/api/integrations/google/start?provider=gmail" className={`mt-3 inline-block rounded px-3 py-1.5 text-sm text-white ${configured ? "bg-indigo-600" : "pointer-events-none bg-slate-400"}`}>Connect Gmail</a> : (
            <>
              <ScopePicker provider="gmail" selected={(gm.config as { labelIds?: string[] }).labelIds ?? []} />
              <div className="mt-2"><SyncButton url="/api/integrations/google" body={{ provider: "gmail" }} label="Sync selected labels" /></div>
            </>
          )}
        </Card>

        <Card provider="calendar" title="Google Calendar" a={cal} blurb={`Meeting briefs and follow-up reminders. Stores ONLY events whose guests match a tracked investor; everything else is dropped. Permissions: ${GOOGLE_SCOPES.calendar.filter((s) => s.startsWith("https")).map(friendly).join(" + ")}.`}>
          {!cal ? <a href="/api/integrations/google/start?provider=calendar" className={`mt-3 inline-block rounded px-3 py-1.5 text-sm text-white ${configured ? "bg-indigo-600" : "pointer-events-none bg-slate-400"}`}>Connect Calendar</a> : (
            <>
              <ScopePicker provider="calendar" selected={(cal.config as { calendarIds?: string[] }).calendarIds ?? []} />
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <SyncButton url="/api/integrations/google" body={{ provider: "calendar" }} label="Sync (incremental)" />
                <ApiForm url="/api/integrations/google" method="PUT" className="flex items-center gap-2 text-xs" fields={[{ name: "deriveEdges", label: "Suggest weak intro edges from shared meetings (unconfirmed)", type: "checkbox", defaultValue: String(!!(cal.config as { deriveEdges?: boolean }).deriveEdges) }]} extra={{ provider: "calendar" }} submit="Save" />
              </div>
            </>
          )}
        </Card>

        <Card provider="hubspot" title="HubSpot (CRM)" a={hs} blurb="Pull companies into your investor list (blank-fill and conflict review, never silent overwrite) and optionally push approved derived fields to HubSpot custom properties. One-way per field; see the ownership matrix below.">
          {!hs ? (
            <ApiForm url="/api/integrations/hubspot" className="mt-3 flex items-end gap-2" fields={[{ name: "token", label: "Private-app access token", required: true }]} extra={{ action: "connect" }} submit="Connect" />
          ) : (
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                <SyncButton url="/api/integrations/hubspot" body={{ action: "preview" }} label="Preview import (dry run)" />
                <SyncButton url="/api/integrations/hubspot" body={{ action: "import" }} label="Import companies" />
              </div>
              <div className="rounded border p-2 text-xs">
                <div className="mb-1 font-medium">Derived fields you approve for pushing (none by default)</div>
                <ApiForm url="/api/integrations/hubspot" className="space-y-1" submit="Save approved fields" collectChecked="fields" extraTop={{ action: "fields" }}
                  fields={Object.entries(PUSHABLE).map(([k, p]) => ({ name: k, label: `${p.label} → ${p.property}`, type: "checkbox" as const, defaultValue: String(((hs.config as { pushFields?: string[] }).pushFields ?? []).includes(k)) }))} />
                <div className="mt-2"><SyncButton url="/api/integrations/hubspot" body={{ action: "push" }} label="Push approved fields now" /></div>
              </div>
            </div>
          )}
        </Card>

        <section className="card p-4 text-xs">
          <h2 className="text-base font-semibold">Field ownership (CRM sync)</h2>
          <p className="mb-2 text-slate-600">One owner per field. The other side never silently overwrites it.</p>
          <table className="w-full text-left">
            <tbody>{Object.entries(FIELD_OWNERSHIP).map(([f, o]) => (
              <tr key={f} className="border-t"><td className="py-1 pr-2 font-mono">{f}</td><td className="pr-2">{o.owner === "crm" ? <Badge kind="private">CRM owns</Badge> : <Badge kind="confirmed">This app owns</Badge>}</td><td className="text-slate-500">{o.note}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
