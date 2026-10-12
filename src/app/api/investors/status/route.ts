import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { setContactStatus } from "@/lib/db/user-writer";

export const dynamic = "force-dynamic";

const Body = z.object({
  vc_id: z.string().uuid(),
  status: z.enum(["yet_to_reach_out", "waiting_for_response", "in_conversation", "closed"]),
});

/** Founder drags an investor card to another stage. Changes contact_status only (allow-listed RPC). */
export const POST = adminRoute(Body, async ({ vc_id, status }) => {
  await setContactStatus(vc_id, status);
  return { ok: true };
});
