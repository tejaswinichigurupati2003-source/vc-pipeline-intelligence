import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { db } from "@/lib/db/client";
import { resolveConflict } from "@/lib/importer/service";

export const dynamic = "force-dynamic";

export const GET = adminRoute(null, async () => {
  const { data } = await db().from("import_conflicts").select("*").order("created_at", { ascending: false }).limit(200);
  return { conflicts: data ?? [] };
});

const Body = z.object({ id: z.string().uuid(), choice: z.enum(["keep_existing", "use_incoming", "ignore"]) });
export const POST = adminRoute(Body, async ({ id, choice }) => ({ status: await resolveConflict(id, choice) }));
