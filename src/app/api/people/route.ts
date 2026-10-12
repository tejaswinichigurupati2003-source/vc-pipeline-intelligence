import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { addPeople, removePerson } from "@/lib/people/store";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), vc_id: z.string().uuid(), name: z.string().trim().min(3).max(80), role: z.string().trim().max(60).optional() }),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }),
]);

/** Associated people for an investor. Their own table; the investor row itself is never changed here. */
export const POST = adminRoute(Body, async (b) => {
  if (b.action === "remove") { await removePerson(b.id); return { ok: true }; }
  if (b.name.split(/\s+/).length < 2) throw new Error("Please enter a first and last name");
  await addPeople(b.vc_id, [{ name: b.name, role: b.role || null }], "manual", null);
  return { ok: true };
});
