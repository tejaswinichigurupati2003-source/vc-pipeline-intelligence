import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { previewImport } from "@/lib/importer/service";

export const dynamic = "force-dynamic";

const Body = z.object({ csv: z.string().min(1).max(2_000_000), mapping: z.record(z.string(), z.string()).optional() });

/** Dry run. Writes nothing. */
export const POST = adminRoute(Body, ({ csv, mapping }) => previewImport(csv, mapping));
