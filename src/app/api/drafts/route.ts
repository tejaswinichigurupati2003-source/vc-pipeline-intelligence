import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { createGmailDraft } from "@/lib/google/gmail";
import { buildDraftForVc } from "@/lib/workspace/drafts";

export const dynamic = "force-dynamic";

const Body = z.object({
  vc_id: z.string().uuid(),
  style: z.enum(["standard", "short"]).default("standard"),
  create: z.boolean().default(false),
  // When saving, the founder's edited text wins over the generated suggestion.
  subject: z.string().max(300).optional(),
  body: z.string().max(10_000).optional(),
  to: z.string().max(320).optional(),
});

/**
 * Suggests a message from the investor's strongest verified signal and the founder's approved facts.
 * With create=true it saves a Gmail DRAFT (never sends); the founder reviews and sends it from Gmail.
 */
export const POST = adminRoute(Body, async ({ vc_id, style, create, subject, body, to }) => {
  const s = await buildDraftForVc(vc_id, style);
  if (!s) throw new Error("investor not found");
  if (!create) return { draft: s.draft, to: s.to, basedOn: s.basedOn };
  const created = await createGmailDraft({ to: to ?? s.to, subject: subject ?? s.draft.subject, body: body ?? s.draft.body, threadId: s.threadId });
  return { draft: s.draft, created };
});
