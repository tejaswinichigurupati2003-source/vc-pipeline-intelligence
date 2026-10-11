const num = (v: string | undefined, d: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};

export const config = {
  lookbackDays: num(process.env.LOOKBACK_DAYS, 30),
  maxQueriesPerVc: num(process.env.MAX_QUERIES_PER_VC, 4),
  maxCandidatesPerVc: num(process.env.MAX_CANDIDATES_PER_VC, 6),
  batchSize: num(process.env.BATCH_SIZE, 4),
  maxParallelVcs: num(process.env.MAX_PARALLEL_VCS, 3),
  requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 8000),
  cooldownDays: num(process.env.COOLDOWN_DAYS, 14),
  llmMaxCallsPerRun: num(process.env.LLM_MAX_CALLS_PER_RUN, 60),
  maxDurationSec: 60,
  classifierVersion: "v1",
  appVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
};

/** Never fetched or used as evidence (login walls, terms, or profile aggregators). */
export const BLOCKED_DOMAINS = [
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "crunchbase.com",
  "pitchbook.com",
  "tracxn.com",
  "zoominfo.com",
  "rocketreach.co",
  "signalhire.com",
  "cbinsights.com",
];

export const ACTION_WORDS = [
  "invested", "invests", "investment", "led", "leads", "backed", "backs", "backing",
  "announces", "announced", "appears", "keynote", "panel", "podcast", "interview",
  "joins", "joined", "closes", "closed", "raises", "raised", "launches", "launched",
  "speaks", "speaker", "webinar", "funds", "funding",
];

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}
