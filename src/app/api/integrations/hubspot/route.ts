import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { connectHubspot, importHubspot, previewHubspotImport, pushDerived, setPushFields } from "@/lib/crm/hubspot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), token: z.string().min(10).max(300) }),
  z.object({ action: z.literal("preview") }),
  z.object({ action: z.literal("import") }),
  z.object({ action: z.literal("fields"), fields: z.array(z.string()).max(10) }),
  z.object({ action: z.literal("push") }),
]);

export const POST = adminRoute(Body, async (b) => {
  switch (b.action) {
    case "connect": await connectHubspot(b.token); return { ok: true };
    case "preview": return previewHubspotImport();
    case "import": return importHubspot();
    case "fields": return { approved: await setPushFields(b.fields) };
    case "push": return pushDerived();
  }
});
