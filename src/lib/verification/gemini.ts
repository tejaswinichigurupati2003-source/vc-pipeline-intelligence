import { GoogleGenAI } from "@google/genai";
import pLimit from "p-limit";
import { requireEnv } from "@/lib/config";
import { LlmUnavailable, thinking } from "./classify";

/**
 * Generic "ask Gemini Flash for JSON" with the same safeguards as the evidence classifier: temperature 0.1, low thinking,
 * 45s request timeout, fallback model, a short retry on a busy 429/5xx, and one re-ask when the JSON is invalid.
 * The caller supplies `parse`, which must validate the shape (zod) and throw on anything unexpected.
 */
const slots = pLimit(2);
const statusOf = (e: unknown): number | undefined => (e as { status?: number })?.status;

export async function geminiJson<T>(opts: {
  system: string;
  user: string;
  schema: unknown;
  parse: (raw: string) => T;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ value: T; calls: number }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const models = [requireEnv("GEMINI_MODEL"), process.env.GEMINI_FALLBACK_MODEL].filter(Boolean) as string[];
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY"), httpOptions: { timeout: 45_000 } });
  let calls = 0;
  let lastErr: unknown;

  for (let round = 0; round < 3; round++) {
    if (round > 0) await sleep(2500 * round);
    let transient = false;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw: string;
        try {
          calls++;
          raw = await slots(async () => {
            const res = await ai.models.generateContent({
              model,
              contents: attempt === 0 ? opts.user : `${opts.user}\n\nReturn valid JSON only, matching the schema.`,
              config: { systemInstruction: opts.system, temperature: 0.1, responseMimeType: "application/json", responseSchema: opts.schema as never, ...thinking() },
            });
            return res.text ?? "{}";
          });
        } catch (e) {
          lastErr = e;
          const s = statusOf(e);
          if (s === 429 || (s !== undefined && s >= 500)) { transient = true; break; }
          throw new LlmUnavailable("error", `Gemini error: ${(e as Error).message}`, calls);
        }
        try {
          return { value: opts.parse(raw), calls };
        } catch (e) {
          lastErr = e;
          if (attempt === 1) throw new LlmUnavailable("invalid_json", "Gemini returned invalid JSON twice", calls);
        }
      }
    }
    if (!transient) break;
  }
  throw new LlmUnavailable(statusOf(lastErr) === 429 ? "quota" : "error", `Gemini unavailable: ${(lastErr as Error)?.message ?? "unknown"}`, calls);
}
