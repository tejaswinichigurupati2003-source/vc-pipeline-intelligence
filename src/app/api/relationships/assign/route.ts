import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const Body = z.object({ event_id: z.string().uuid(), vc_id: z.string().uuid().nullable() });

/**
 * Correct a wrong VC match (or assign an unmatched thread). Also learns the sender: the participant emails become
 * contacts for that investor so future threads match, and the correction is logged as feedback.
 */
export const POST = adminRoute(Body, async ({ event_id, vc_id }) => {
  const { data: ev } = await db().from("relationship_events").select("id, vc_id, participants").eq("id", event_id).maybeSingle();
  if (!ev) throw new Error("event not found");
  await db().from("relationship_events").update({ vc_id }).eq("id", event_id);
  await db().from("commitments").update({ vc_id }).eq("event_id", event_id);
  await db().from("user_feedback").insert({ vc_id: vc_id ?? ev.vc_id, target_type: "vc_match", target_id: event_id, verdict: vc_id ? "corrected" : "wrong", note: ev.vc_id ? `was ${ev.vc_id}` : "was unmatched" });
  if (vc_id) {
    for (const email of (ev.participants as string[]).slice(0, 3)) {
      await db().from("vc_contacts").insert({ vc_id, email, source: "gmail" }); // unique(lower(email)) ignores repeats
    }
  } else {
    // "Not this investor": stop auto-matching these addresses to the previous investor.
    await db().from("vc_contacts").delete().in("email", ev.participants as string[]).eq("source", "gmail");
  }
  return { ok: true };
});
