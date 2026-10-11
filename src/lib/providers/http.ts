import { config } from "@/lib/config";

export class ProviderError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with timeout; retries network errors, 5xx and 429 with exponential backoff + jitter (max 2 retries). */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? config.requestTimeoutMs) });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(400 * 2 ** attempt + Math.random() * 250);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(400 * 2 ** attempt + Math.random() * 250);
    }
  }
  throw new ProviderError("network", `Request failed: ${(lastErr as Error)?.message ?? lastErr}`);
}
