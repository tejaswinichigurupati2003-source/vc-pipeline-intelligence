import { db } from "@/lib/db/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { commitImport, previewImport } from "@/lib/importer/service";
import { normalizeDomain } from "@/lib/importer/mapping";
import { toCsv } from "@/lib/export";
import { assertPushable, PUSHABLE } from "./ownership";
import { getAccount } from "@/lib/google/oauth";

/** HubSpot CRM v3 (https://developers.hubspot.com/docs/reference/api/overview). Auth: a private-app access token. */
const API = "https://api.hubapi.com";

async function hs<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (res.status === 204 ? {} : await res.json()) as T;
}

async function tokenOf(): Promise<string> {
  const a = await getAccount("hubspot");
  if (!a?.token_enc || a.status === "disconnected") throw new Error("HubSpot is not connected");
  return JSON.parse(decrypt(a.token_enc)).token;
}

/** Verifies the token with a minimal read before storing it (encrypted). */
export async function connectHubspot(token: string) {
  await hs(token, "/crm/v3/objects/companies?limit=1");
  const { error } = await db().from("integration_accounts").upsert({
    provider: "hubspot", account_label: "HubSpot private app", scopes: ["crm.objects.companies.read", "crm.objects.companies.write", "crm.schemas.companies.write"],
    status: "connected", token_enc: encrypt(JSON.stringify({ token })), last_error: null, connected_at: new Date().toISOString(),
    config: { pushFields: [] },
  }, { onConflict: "provider" });
  if (error) throw new Error(error.message);
}

interface Company { id: string; properties: { name?: string | null; domain?: string | null } }

export async function pullCompanies(max = 500): Promise<Company[]> {
  const token = await tokenOf();
  const out: Company[] = [];
  let after: string | undefined;
  while (out.length < max) {
    const j = await hs<{ results: Company[]; paging?: { next?: { after: string } } }>(token, `/crm/v3/objects/companies?limit=100&properties=name,domain${after ? `&after=${after}` : ""}`);
    out.push(...j.results);
    after = j.paging?.next?.after;
    if (!after) break;
  }
  return out.slice(0, max);
}

/** Company list -> the same CSV importer used for files, so dedupe, blanks-only fill and conflict review all apply. */
function toImportCsv(cs: Company[]): string {
  const rows = cs.filter((c) => c.properties.name).map((c) => ({
    investor_name: c.properties.name, firm_name: c.properties.name, firm_domain: c.properties.domain ? normalizeDomain(c.properties.domain) ?? "" : "",
  }));
  return toCsv(rows, ["investor_name", "firm_name", "firm_domain"]);
}
const MAPPING = { investor_name: "investor_name", firm_name: "firm_name", firm_domain: "firm_domain" };

export async function previewHubspotImport() {
  const cs = await pullCompanies();
  return { companies: cs.length, preview: await previewImport(toImportCsv(cs), MAPPING) };
}

export async function importHubspot() {
  const cs = await pullCompanies();
  const result = await commitImport(toImportCsv(cs), MAPPING, "hubspot", "hubspot");
  const linked = await linkCompanies(cs);
  await db().from("integration_accounts").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("provider", "hubspot");
  return { ...result, linked };
}

/** Link CRM companies to tracked investors by firm name or domain, so pushes know where to go. Never creates or edits investors. */
export async function linkCompanies(cs: Company[]): Promise<number> {
  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_name, firm_domain");
  const byName = new Map((vcs ?? []).map((v) => [v.firm_name.toLowerCase(), v.id]));
  const byDom = new Map((vcs ?? []).filter((v) => v.firm_domain).map((v) => [v.firm_domain.toLowerCase(), v.id]));
  let n = 0;
  for (const c of cs) {
    const dom = c.properties.domain ? normalizeDomain(c.properties.domain) : null;
    const vcId = byName.get((c.properties.name ?? "").toLowerCase()) ?? (dom ? byDom.get(dom) : undefined);
    if (!vcId) continue;
    const { error } = await db().from("crm_links").upsert({ vc_id: vcId, provider: "hubspot", external_id: c.id }, { onConflict: "vc_id,provider" });
    if (!error) n++;
  }
  return n;
}

async function ensureProperties(token: string, fields: string[]) {
  for (const f of fields) {
    const p = PUSHABLE[f];
    if (!p) continue;
    try {
      await hs(token, `/crm/v3/properties/companies/${p.property}`);
    } catch {
      await hs(token, "/crm/v3/properties/companies", { method: "POST", body: JSON.stringify({ name: p.property, label: p.label, type: p.type, fieldType: p.fieldType, groupName: "companyinformation" }) });
    }
  }
}

export async function setPushFields(fields: string[]) {
  const valid = fields.filter((f) => f in PUSHABLE);
  const a = await getAccount("hubspot");
  if (!a) throw new Error("HubSpot is not connected");
  await db().from("integration_accounts").update({ config: { ...a.config, pushFields: valid } }).eq("provider", "hubspot");
  return valid;
}

/** Pushes ONLY founder-approved derived fields, ONLY to linked companies, ONLY to our vcpi_* properties. One-way. */
export async function pushDerived() {
  const a = await getAccount("hubspot");
  const fields = ((a?.config?.pushFields as string[] | undefined) ?? []).filter((f) => f in PUSHABLE);
  if (!fields.length) throw new Error("No fields approved for pushing. Approve at least one derived field first.");
  const token = await tokenOf();
  await ensureProperties(token, fields);
  const { data: links } = await db().from("crm_links").select("vc_id, external_id").eq("provider", "hubspot");
  const { data: vcs } = await db().from("vc_pipeline").select("id, follow_up_score, recommended_action, last_signal_date, signal_summary");
  const byId = new Map((vcs ?? []).map((v) => [v.id, v as Record<string, unknown>]));
  let pushed = 0;
  for (const l of links ?? []) {
    const v = byId.get(l.vc_id);
    if (!v || v.follow_up_score == null) continue; // never push values that were never computed
    const props: Record<string, unknown> = {};
    for (const f of fields) {
      const val = v[f];
      if (val == null) continue;
      if (PUSHABLE[f].type === "date") {
        const d = new Date(String(val)); // HubSpot date properties take midnight-UTC epoch milliseconds
        props[PUSHABLE[f].property] = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      } else props[PUSHABLE[f].property] = val;
    }
    if (!Object.keys(props).length) continue;
    assertPushable(props);
    await hs(token, `/crm/v3/objects/companies/${l.external_id}`, { method: "PATCH", body: JSON.stringify({ properties: props }) });
    await db().from("crm_links").update({ last_pushed_at: new Date().toISOString() }).eq("vc_id", l.vc_id).eq("provider", "hubspot");
    pushed++;
  }
  await db().from("integration_accounts").update({ last_sync_at: new Date().toISOString() }).eq("provider", "hubspot");
  return { pushed, fields };
}
