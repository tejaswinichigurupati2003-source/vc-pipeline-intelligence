import { db } from "@/lib/db/client";
import type { Candidate } from "@/lib/types";
import { safeFetchText } from "@/lib/discovery/fetch-page";
import { parseFeed } from "./feed";

/** Poll active vc_sources feeds for a VC. A failed feed is recorded as an error, never as "no new items". */
export async function monitorFeeds(vcId: string): Promise<{ items: Omit<Candidate, "id">[]; errors: string[] }> {
  const { data: sources } = await db().from("vc_sources").select("id, feed_url").eq("vc_id", vcId).eq("active", true);
  const items: Omit<Candidate, "id">[] = [];
  const errors: string[] = [];
  for (const s of sources ?? []) {
    const now = new Date().toISOString();
    try {
      const { body } = await safeFetchText(s.feed_url, { allowXml: true });
      items.push(...parseFeed(body, "feed", true));
      await db().from("vc_sources").update({ last_checked_at: now, last_success_at: now, last_error: null }).eq("id", s.id);
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`${s.feed_url}: ${msg}`);
      await db().from("vc_sources").update({ last_checked_at: now, last_error: msg }).eq("id", s.id);
    }
  }
  return { items, errors };
}
