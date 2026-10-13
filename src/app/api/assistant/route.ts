import { z } from "zod";
import { adminRoute } from "@/lib/api";
import { allowAsk, askAssistant } from "@/lib/assistant/ask";
import { LlmUnavailable } from "@/lib/verification/classify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(2).max(300) });

export const POST = adminRoute(Body, async ({ question }) => {
  if (!allowAsk()) throw new Error("Too many questions in a short time. Try again in a minute.");
  try {
    return await askAssistant(question);
  } catch (e) {
    if (e instanceof LlmUnavailable) throw new Error("The assistant is busy right now. Please try again in a moment.");
    throw e;
  }
});
