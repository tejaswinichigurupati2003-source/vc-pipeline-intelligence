import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { commitImport } from "@/lib/importer/service";

export const dynamic = "force-dynamic";

const Body = z.object({
  csv: z.string().min(1).max(2_000_000),
  mapping: z.record(z.string(), z.string()),
  filename: z.string().max(200).nullable().optional(),
});

export const POST = adminRoute(Body, ({ csv, mapping, filename }) => commitImport(csv, mapping, filename ?? null));
