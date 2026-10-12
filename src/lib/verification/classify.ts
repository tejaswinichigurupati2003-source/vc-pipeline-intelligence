import { GoogleGenAI, Type } from "@google/genai";
import pLimit from "p-limit";
import { z } from "zod";
import { requireEnv } from "@/lib/config";
import type { VcProfile } from "@/lib/types";
import { buildSystemInstruction, buildUserMessage, type PromptCandidate } from "./prompt";

export class LlmUnavailable extends Error {
  constructor(public reason: "quota" | "error" | "invalid_json", message: string, public calls = 1) {
    super(message);
  }
}

export const ClassificationZ = z.object({
  candidate_id: z.string(),
  reasoning: z.string(),
  entity_match: z.boolean(),
  signal_type: z.enum([
    "investor_thesis", "portfolio_investment", "investor_commentary",
    "event_appearance", "fund_activity", "portfolio_activity", "general_mention",
  ]),
  published_at: z.string().nullable().optional(),
  event_at: z.string().nullable().optional(),
  date_basis: z.enum(["page_text", "relative_resolved", "none"]),
  evidence_summary: z.string(),
  evidence_quote: z.string().nullable().optional(),
  relevance_score: z.number().min(0).max(1),
  confidence: z.enum(["high", "medium", "low"]),
  needs_human_review: z.boolean(),
});
export const ClassificationBatchZ = z.object({ results: z.array(ClassificationZ) });
export type Classification = z.infer<typeof ClassificationZ>;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          candidate_id: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          entity_match: { type: Type.BOOLEAN },
          signal_type: {
            type: Type.STRING,
            enum: ["investor_thesis", "portfolio_investment", "investor_commentary",
                   "event_appearance", "fund_activity", "portfolio_activity", "general_mention"],
          },
          published_at: { type: Type.STRING, nullable: true },
          event_at: { type: Type.STRING, nullable: true },
          date_basis: { type: Type.STRING, enum: ["page_text", "relative_resolved", "none"] },
          evidence_summary: { type: Type.STRING },
          evidence_quote: { type: Type.STRING, nullable: true },
          relevance_score: { type: Type.NUMBER },
          confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
          needs_human_review: { type: Type.BOOLEAN },
        },
        required: ["candidate_id", "reasoning", "entity_match", "signal_type", "date_basis",
                   "evidence_summary", "relevance_score", "confidence", "needs_human_review"],
      },
    },
  },
  required: ["results"],
};

export function parseClassification(raw: string, validIds: Set<string>): Classification[] {
  const parsed = ClassificationBatchZ.parse(JSON.parse(raw));
  return parsed.results.filter((r) => validIds.has(r.candidate_id));
}

type Generate = (model: string, system: string, user: string) => Promise<string>;

// Parallel investors share a small number of in-flight Gemini requests (free-tier friendly).
const geminiSlots = pLimit(4);

const defaultGenerate: Generate = (model, system, user) => geminiSlots(() => generateOnce(model, system, user));

/**
 * Classification needs little model "thinking" (the answers are re-checked by code), and a lower level is much faster:
 * "low" gave the same verdicts in a third of the time. GEMINI_THINKING = low (default) | medium | high | off.
 */
const thinking = () => {
  const level = (process.env.GEMINI_THINKING ?? "low").toLowerCase();
  return level === "off" || level === "default" ? {} : { thinkingConfig: { thinkingLevel: level.toUpperCase() as never } };
};

const generateOnce: Generate = async (model, system, user) => {
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY"), httpOptions: { timeout: 45_000 } });
  const res = await ai.models.generateContent({
    model,
    contents: user,
    config: { systemInstruction: system, temperature: 0.1, responseMimeType: "application/json", responseSchema, ...thinking() },
  });
  return res.text ?? "{}";
};

const statusOf = (e: unknown): number | undefined => (e as { status?: number })?.status;

/**
 * ONE Gemini call for all of a VC's shortlisted candidates.
 * 429/5xx -> try fallback model once -> LlmUnavailable. Invalid JSON -> one retry, then LlmUnavailable.
 * `calls` reports how many API requests were made (for the per-run cap).
 */
export async function classifyCandidates(
  vc: VcProfile,
  cands: PromptCandidate[],
  runDate: Date,
  generate: Generate = defaultGenerate,
  opts: { sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ results: Classification[]; calls: number }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const system = buildSystemInstruction(vc, runDate);
  const user = buildUserMessage(cands);
  const ids = new Set(cands.map((c) => c.id));
  const models = [requireEnv("GEMINI_MODEL"), process.env.GEMINI_FALLBACK_MODEL].filter(Boolean) as string[];
  let calls = 0;
  let lastErr: unknown;

  // A busy moment (429/5xx) is usually over within seconds: retry a couple of times before reporting Gemini unavailable.
  for (let round = 0; round < 3; round++) {
    if (round > 0) await sleep(2500 * round);
    let transient = false;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const prompt = attempt === 0 ? user : user + "\n\nReturn valid JSON only, matching the schema.";
        let raw: string;
        try {
          calls++;
          raw = await generate(model, system, prompt);
        } catch (e) {
          lastErr = e;
          const s = statusOf(e);
          if (s === 429 || (s !== undefined && s >= 500)) { transient = true; break; } // next model
          throw new LlmUnavailable("error", `Gemini error: ${(e as Error).message}`, calls);
        }
        try {
          return { results: parseClassification(raw, ids), calls };
        } catch (e) {
          lastErr = e;
          if (attempt === 1) throw new LlmUnavailable("invalid_json", "Gemini returned invalid JSON twice", calls);
        }
      }
    }
    if (!transient) break;
  }
  const quota = statusOf(lastErr) === 429;
  throw new LlmUnavailable(quota ? "quota" : "error", `Gemini unavailable: ${(lastErr as Error)?.message ?? "unknown"}`, calls);
}
