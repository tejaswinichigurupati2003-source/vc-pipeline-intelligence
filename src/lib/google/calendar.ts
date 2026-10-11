import { db } from "@/lib/db/client";
import { recordMeetingEdge } from "@/lib/intros/service";
import { buildMatchIndex, matchAddresses } from "@/lib/relationships/match";
import { getAccessToken } from "./oauth";

const API = "https://www.googleapis.com/calendar/v3";

async function cfetch<T>(path: string): Promise<{ status: number; json: T | null }> {
  const { token } = await getAccessToken("calendar");
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 410) return { status: 410, json: null };
  if (!res.ok) throw new Error(`Calendar API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { status: res.status, json: (await res.json()) as T };
}

export interface CalendarListItem { id: string; summary: string; primary?: boolean }

export async function listCalendars(): Promise<CalendarListItem[]> {
  const { json } = await cfetch<{ items?: CalendarListItem[] }>("/users/me/calendarList?minAccessRole=reader");
  return json?.items ?? [];
}

interface GEvent {
  id: string; status?: string; summary?: string; htmlLink?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; self?: boolean; responseStatus?: string }[];
}
interface EventsPage { items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }

export interface CalendarSyncResult { calendars: number; seen: number; stored: number; removed: number; resets: number }

/**
 * Sync only calendars the founder selected, and STORE only events whose guests match a tracked investor.
 * Everything else is dropped immediately (not every event is fundraising related; calendar data is sensitive).
 * Incremental via per-calendar syncToken; a 410 triggers one windowed resync.
 */
export async function syncCalendar(): Promise<CalendarSyncResult> {
  const { account } = await getAccessToken("calendar");
  const cfg = account.config as { calendarIds?: string[]; syncTokens?: Record<string, string>; deriveEdges?: boolean };
  const calendarIds = cfg.calendarIds ?? [];
  if (!calendarIds.length) throw new Error("Choose at least one calendar to sync first");
  const own = (account.account_label ?? "").toLowerCase();

  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_domain, firm_name");
  const firmName = new Map((vcs ?? []).map((v) => [v.id, v.firm_name as string]));
  const { data: contacts } = await db().from("vc_contacts").select("vc_id, email");
  const idx = buildMatchIndex(vcs ?? [], contacts ?? []);
  const tokens = { ...(cfg.syncTokens ?? {}) };
  const out: CalendarSyncResult = { calendars: calendarIds.length, seen: 0, stored: 0, removed: 0, resets: 0 };

  for (const cal of calendarIds) {
    let pageToken: string | undefined;
    let useToken: string | undefined = tokens[cal];
    let nextSync: string | undefined;
    for (let guard = 0; guard < 20; guard++) {
      const p = new URLSearchParams({ singleEvents: "true", maxResults: "250" });
      if (useToken) p.set("syncToken", useToken);
      else {
        p.set("timeMin", new Date(Date.now() - 30 * 86_400_000).toISOString());
        p.set("timeMax", new Date(Date.now() + 90 * 86_400_000).toISOString());
      }
      if (pageToken) p.set("pageToken", pageToken);
      const { status, json } = await cfetch<EventsPage>(`/calendars/${encodeURIComponent(cal)}/events?${p}`);
      if (status === 410) { delete tokens[cal]; useToken = undefined; pageToken = undefined; out.resets++; continue; }
      for (const ev of json?.items ?? []) {
        out.seen++;
        const ref = `${cal}:${ev.id}`;
        if (ev.status === "cancelled") {
          await db().from("calendar_events").delete().eq("external_id", ref);
          out.removed++;
          continue;
        }
        const guests = (ev.attendees ?? []).map((a) => a.email?.toLowerCase()).filter((e): e is string => !!e && e !== own);
        const match = matchAddresses(guests, idx, [own]);
        const startIso = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
        if (!match || !startIso) {
          // No longer an investor meeting (or never was): make sure nothing stale is kept.
          await db().from("calendar_events").delete().eq("external_id", ref);
          continue;
        }
        const { data: prev } = await db().from("calendar_events").select("included, notes, notes_confirmed, followup_done").eq("external_id", ref).maybeSingle();
        await db().from("calendar_events").upsert({
          external_id: ref, vc_id: match.vcId, title: (ev.summary ?? "(no title)").slice(0, 200), start_at: startIso,
          end_at: ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null), guests: guests.slice(0, 10), link_url: ev.htmlLink ?? null,
          included: prev?.included ?? true, notes: prev?.notes ?? null, notes_confirmed: prev?.notes_confirmed ?? false, followup_done: prev?.followup_done ?? false,
        }, { onConflict: "external_id" });
        out.stored++;
        if (cfg.deriveEdges) await recordMeetingEdge(match.vcId, firmName.get(match.vcId) ?? "investor", match.email, startIso);
      }
      if (json?.nextPageToken) { pageToken = json.nextPageToken; continue; }
      nextSync = json?.nextSyncToken;
      break;
    }
    if (nextSync) tokens[cal] = nextSync;
  }
  await db().from("integration_accounts").update({
    last_sync_at: new Date().toISOString(), last_error: null, status: "connected", config: { ...cfg, syncTokens: tokens },
  }).eq("provider", "calendar");
  return out;
}
