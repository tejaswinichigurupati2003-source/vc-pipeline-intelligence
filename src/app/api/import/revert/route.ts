import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { revertBatch } from "@/lib/importer/service";

export const dynamic = "force-dynamic";

export const POST = adminRoute(z.object({ batch_id: z.string().uuid() }), async ({ batch_id }) => ({ removed_vcs: await revertBatch(batch_id) }));
