import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { addSuggestion, setSuggestionStatus } from "@/lib/expansion/service";

export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string().uuid(), action: z.enum(["add", "dismiss", "restore"]) });

export const POST = adminRoute(Body, async ({ id, action }) => {
  if (action === "add") return { ok: true, ...(await addSuggestion(id)) };
  await setSuggestionStatus(id, action === "dismiss" ? "dismissed" : "new");
  return { ok: true };
});
