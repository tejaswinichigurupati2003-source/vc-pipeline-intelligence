import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { db } from "@/lib/db/client";
import { listCalendars, syncCalendar } from "@/lib/google/calendar";
import { listLabels, syncGmail } from "@/lib/google/gmail";
import { getAccount } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Provider = z.enum(["gmail", "calendar"]);

/** GET options: the labels / calendars the founder can choose from. */
export async function GET(req: Request) {
  return adminRoute(null, async () => {
    const provider = Provider.parse(new URL(req.url).searchParams.get("provider"));
    return provider === "gmail" ? { options: (await listLabels()).map((l) => ({ id: l.id, name: l.name })) } : { options: (await listCalendars()).map((c) => ({ id: c.id, name: c.summary })) };
  })(req);
}

const Config = z.object({
  provider: Provider,
  ids: z.array(z.string().max(200)).max(50).optional(),
  deriveEdges: z.boolean().optional(),
});
/** PUT: choose which labels/calendars are in scope (and the opt-in for meeting-derived edges). */
export const PUT = adminRoute(Config, async ({ provider, ids, deriveEdges }) => {
  const a = await getAccount(provider);
  if (!a) throw new Error(`${provider} is not connected`);
  const config = { ...a.config } as Record<string, unknown>;
  if (ids) { config[provider === "gmail" ? "labelIds" : "calendarIds"] = ids; if (provider === "calendar") config.syncTokens = {}; }
  if (deriveEdges !== undefined) config.deriveEdges = deriveEdges;
  await db().from("integration_accounts").update({ config }).eq("provider", provider);
  return { ok: true };
});

/** POST: run a sync now. */
export const POST = adminRoute(z.object({ provider: Provider }), async ({ provider }) => {
  try {
    return provider === "gmail" ? await syncGmail() : await syncCalendar();
  } catch (e) {
    await db().from("integration_accounts").update({ last_error: (e as Error).message.slice(0, 300) }).eq("provider", provider);
    throw e;
  }
});
