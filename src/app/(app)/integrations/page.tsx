import { ApiButton, ApiForm, Badge } from "@/components/ui";
import PageHeader from "@/components/shell/PageHeader";
import ScopePicker from "@/components/ScopePicker";
import SyncButton from "@/components/SyncButton";
import { db } from "@/lib/db/client";
import { PUSHABLE } from "@/lib/crm/ownership";
import { googleConfigured } from "@/lib/google/oauth";
import { fmtDateTime } from "@/lib/view/format";

export const dynamic = "force-dynamic";

const PERMISSION: Record<string, string> = {
  "gmail.metadata": "See email subjects, senders and labels",
  "gmail.compose": "Create drafts (never sends)",
  "calendar.events.readonly": "Read calendar events",
  "calendar.calendarlist.readonly": "List your calendars",
};
const permissions = (scopes: string[]) =>
  scopes.map((s) => s.replace("https://www.googleapis.com/auth/", "")).filter((s) => PERMISSION[s]).map((s) => PERMISSION[s]);

function ConnectLink({ provider, label, ready }: { provider: string; label: string; ready: boolean }) {
  return ready
    ? <a href={`/api/integrations/google/start?provider=${provider}`} className="btn-primary mt-4 no-underline hover:no-underline">{label}</a>
    : <span className="btn-ghost mt-4 cursor-not-allowed opacity-60" title="Not available right now">{label}</span>;
}

export default async function Integrations({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const { data } = await db().from("integration_accounts").select("provider, account_label, scopes, status, config, last_sync_at, last_error, connected_at");
  const acct = (p: string) => (data ?? []).find((a) => a.provider === p);
  const ready = googleConfigured();
  const gm = acct("gmail"), cal = acct("calendar"), hs = acct("hubspot");

  const Card = ({ title, blurb, a, children, provider }: { title: string; blurb: string; a: ReturnType<typeof acct>; children: React.ReactNode; provider: "gmail" | "calendar" | "hubspot" }) => (
    <section className="card flex flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-slate-900 bg-slate-50 px-4 py-3">
        <h2>{title}</h2>
        {a ? <Badge kind={a.status === "connected" ? "verified" : "warn"}>{a.status === "connected" ? "Connected" : "Needs attention"}</Badge> : <Badge kind="neutral">Not connected</Badge>}
      </header>
      <div className="flex-1 p-4">
        <p className="text-[0.9rem] leading-relaxed text-slate-600">{blurb}</p>
        {a && (
          <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-1.5 text-[0.85rem]">
            <dt>Account</dt><dd className="text-slate-800">{a.account_label ?? "—"}</dd>
            {provider !== "hubspot" && <><dt>Access</dt><dd className="text-slate-800">{permissions(a.scopes as string[]).join(" · ") || "—"}</dd></>}
            <dt>Last sync</dt><dd className="text-slate-800">{a.last_sync_at ? fmtDateTime(a.last_sync_at) : "Not yet"}</dd>
            {a.last_error && <><dt className="text-rose-700">Issue</dt><dd className="text-rose-700">{a.last_error}</dd></>}
          </dl>
        )}
        {children}
      </div>
      {a && (
        <footer className="flex flex-wrap gap-2 border-t border-slate-200 px-4 py-3">
          <ApiButton url="/api/integrations/disconnect" body={{ provider, deleteData: false }} label="Disconnect" tone="danger" confirm="Disconnect this account? Data already imported stays until you delete it." />
          <ApiButton url="/api/integrations/disconnect" body={{ provider, deleteData: true }} label="Disconnect and delete imported data" tone="danger" confirm="Disconnect and delete everything imported from this account? Your own notes are kept." />
        </footer>
      )}
    </section>
  );

  return (
    <main>
      <PageHeader title="Integrations" subtitle="Connect the tools you already use. You choose what is shared, and you can disconnect at any time." />
      {sp.connected && <p className="mb-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">{sp.connected === "gmail" ? "Gmail" : "Calendar"} connected. Choose what to include below, then sync.</p>}
      {sp.error && <p className="mb-4 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">We couldn&apos;t complete the connection. Please try again.</p>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card provider="gmail" title="Gmail" a={gm} blurb="See which investors have replied, spot requests for your deck or a meeting, and save drafts for you to review and send. Only the labels you pick are read.">
          {!gm ? <ConnectLink provider="gmail" label="Connect Gmail" ready={ready} /> : (
            <div className="mt-4 space-y-3">
              <ScopePicker provider="gmail" selected={(gm.config as { labelIds?: string[] }).labelIds ?? []} />
              <SyncButton url="/api/integrations/google" body={{ provider: "gmail" }} label="Sync now" />
            </div>
          )}
        </Card>

        <Card provider="calendar" title="Google Calendar" a={cal} blurb="Get a briefing before each investor meeting and a reminder to follow up afterwards. Only meetings with investors you track are kept.">
          {!cal ? <ConnectLink provider="calendar" label="Connect Calendar" ready={ready} /> : (
            <div className="mt-4 space-y-3">
              <ScopePicker provider="calendar" selected={(cal.config as { calendarIds?: string[] }).calendarIds ?? []} />
              <SyncButton url="/api/integrations/google" body={{ provider: "calendar" }} label="Sync now" />
              <ApiForm url="/api/integrations/google" method="PUT" className="flex items-center gap-2 text-[0.85rem]" fields={[{ name: "deriveEdges", label: "Suggest introductions from shared meetings", type: "checkbox", defaultValue: String(!!(cal.config as { deriveEdges?: boolean }).deriveEdges) }]} extra={{ provider: "calendar" }} submit="Save" />
            </div>
          )}
        </Card>

        <Card provider="hubspot" title="HubSpot" a={hs} blurb="Bring your HubSpot companies into your investor list. Company names and websites come from HubSpot; your notes, stages and scores stay here.">
          {!hs ? (
            <ApiForm url="/api/integrations/hubspot" className="mt-4 space-y-2" fields={[{ name: "token", label: "HubSpot access token", required: true }]} extra={{ action: "connect" }} submit="Connect HubSpot" />
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <SyncButton url="/api/integrations/hubspot" body={{ action: "preview" }} label="Preview import" />
                <SyncButton url="/api/integrations/hubspot" body={{ action: "import" }} label="Import companies" />
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="eyebrow mb-2">Send back to HubSpot</div>
                <ApiForm url="/api/integrations/hubspot" className="space-y-1.5 text-[0.85rem]" submit="Save" collectChecked="fields" extraTop={{ action: "fields" }}
                  fields={Object.entries(PUSHABLE).map(([k, p]) => ({ name: k, label: p.label, type: "checkbox" as const, defaultValue: String(((hs.config as { pushFields?: string[] }).pushFields ?? []).includes(k)) }))} />
                <div className="mt-3"><SyncButton url="/api/integrations/hubspot" body={{ action: "push" }} label="Send now" /></div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
