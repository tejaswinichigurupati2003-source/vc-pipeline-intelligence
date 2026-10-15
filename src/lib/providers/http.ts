import { config } from "@/lib/config";

export class ProviderError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * How long to wait before retrying. A 429 means the provider is rate limiting us, and 0.4 to 1.6 s was too short to clear it:
 * two investors in one scan were left unrefreshed. For 429 honour Retry-After (capped at 8 s), otherwise back off 1.5 s, 3 s, 6 s.
 */
export function backoffMs(status: number | null, attempt: number, retryAfter?: string | null, jitter = Math.random() * 250): number {
  if (status === 429) {
    const ra = retryAfter ? Number(retryAfter) : NaN;
    return Math.min(8000, Number.isFinite(ra) && ra >= 0 ? Math.max(ra * 1000, 500) : 1500 * 2 ** attempt) + jitter;
  }
  return 400 * 2 ** attempt + jitter;
}

/** fetch with timeout; retries network errors and 5xx (max 2 retries) and 429 (max 3 retries) with backoff + jitter. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  let attemptsAllowed = retries;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= attemptsAllowed; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs ?? config.requestTimeoutMs) });
      if (res.status === 429 && attemptsAllowed === retries) attemptsAllowed = retries + 1; // one extra try for rate limits
      if ((res.status === 429 || res.status >= 500) && attempt < attemptsAllowed) {
        await sleep(backoffMs(res.status, attempt, res.headers.get("retry-after")));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < attemptsAllowed) await sleep(backoffMs(null, attempt));
    }
  }
  throw new ProviderError("network", `Request failed: ${(lastErr as Error)?.message ?? lastErr}`);
}
