import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { saveCompanyContext } from "@/lib/company/context";
import { clearSampleCompany, loadSampleCompany } from "@/lib/company/sample";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    name: z.string().max(120).optional(), sector: z.string().max(300).optional(), productSummary: z.string().max(1500).optional(),
    targetCustomer: z.string().max(500).optional(), geography: z.string().max(300).optional(), businessModel: z.string().max(300).optional(),
    stage: z.string().max(60).optional(), round: z.string().max(60).optional(),
  }),
  z.object({ action: z.literal("load_sample") }),
  z.object({ action: z.literal("clear_sample") }),
]);

export const POST = adminRoute(Body, async (b) => {
  if (b.action === "load_sample") { await loadSampleCompany(); return { ok: true, message: "Sample company loaded" }; }
  if (b.action === "clear_sample") { await clearSampleCompany(); return { ok: true, message: "Sample company removed" }; }
  const { action: _a, geography, ...rest } = b;
  await saveCompanyContext({ ...rest, geography: (geography ?? "").split(",").map((g) => g.trim()).filter(Boolean), isSynthetic: false });
  return { ok: true, message: "Saved" };
});
