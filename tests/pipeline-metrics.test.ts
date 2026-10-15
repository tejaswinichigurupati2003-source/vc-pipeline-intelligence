import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizePipeline } from "@/lib/insights/scan-summary";
import { backoffMs, fetchWithRetry } from "@/lib/providers/http";
import { bucketFor } from "@/lib/view/buckets";
import { ACTIONS, recommendAction } from "@/lib/scoring/recommend";
import { NOW } from "./helpers";

type R = Parameters<typeof summarizePipeline>[0][number];
const row = (bucket: string, sources30d = 0): R => ({ bucket: bucket as R["bucket"], evidence: { sources30d, momentum: "none" } });

describe("what the Today numbers count", () => {
  const rows = [row("reach_out", 2), row("review", 1), row("review", 3), row("hold", 1), row("hold", 0), row("quiet"), row("quiet"), row("stale", 5)];

  it("keeps each stage separate: tracked, investors with verified news, ready, worth a look, hold, quiet, needs refresh", () => {
    const s = summarizePipeline(rows, null);
    expect(s).toMatchObject({ tracked: 8, withNews: 4, sources: 7, ready: 1, worthLook: 2, hold: 2, quiet: 2, needsRefresh: 1 });
  });
  it("sources on an investor whose search failed are not presented as fresh news", () => {
    expect(summarizePipeline(rows, null).sources).toBe(7); // the stale investor's 5 sources are excluded
  });
  it("'49 of 51' means 2 searches did not finish, and 'new this scan' is not the total on file", () => {
    const s = summarizePipeline(rows, { status: "partial", vcs_targeted: 51, vcs_succeeded: 49, signals_accepted: 1 });
    expect(s.refreshed).toBe(49);
    expect(s.notRefreshed).toBe(2);
    expect(s.newSignals).toBe(1);
    expect(s.sources).toBeGreaterThan(s.newSignals!);
  });
  it("a run still in progress does not report unfinished investors as failures", () => {
    expect(summarizePipeline(rows, { status: "running", vcs_targeted: 51, vcs_succeeded: 10, signals_accepted: 0 }).notRefreshed).toBe(0);
  });
});

describe("a failed or incomplete search is never a quiet investor", () => {
  it.each(["failed", "partial"])("latest scan %s -> needs refresh, even if the stored action says skip", (status) => {
    expect(bucketFor({ recommended_action: ACTIONS.SKIP, contact_status: "yet_to_reach_out", latest_item_status: status })).toBe("stale");
  });
  it("a finished search with nothing found is quiet", () => {
    expect(bucketFor({ recommended_action: ACTIONS.SKIP, contact_status: "yet_to_reach_out", latest_item_status: "no_verified_signal" })).toBe("quiet");
  });
});

describe("the action comes from deterministic rules, not the model", () => {
  it("same band and status always give the same action", () => {
    expect(recommendAction("high", "yet_to_reach_out", null, NOW)).toBe(ACTIONS.REACH_OUT);
    expect(recommendAction("medium", "yet_to_reach_out", null, NOW)).toBe(ACTIONS.REVIEW);
    expect(recommendAction("low", "yet_to_reach_out", null, NOW)).toBe(ACTIONS.SKIP);
    expect(recommendAction("high", "waiting_for_response", null, NOW)).toBe(ACTIONS.HOLD);
  });
});

describe("rate-limit (429) retries", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("waits long enough: honours Retry-After, else 1.5 s then 3 s then 6 s, capped at 8 s", () => {
    expect(backoffMs(429, 0, null, 0)).toBe(1500);
    expect(backoffMs(429, 1, null, 0)).toBe(3000);
    expect(backoffMs(429, 2, null, 0)).toBe(6000);
    expect(backoffMs(429, 0, "3", 0)).toBe(3000);
    expect(backoffMs(429, 0, "120", 0)).toBe(8000);
    expect(backoffMs(503, 1, null, 0)).toBe(800);
  });
  it("a request limited twice still succeeds on the third try", async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async () => { calls.push(1); return calls.length < 3 ? new Response("slow down", { status: 429, headers: { "retry-after": "1" } }) : new Response("ok", { status: 200 }); }));
    const p = fetchWithRetry("https://example.test/search");
    await vi.advanceTimersByTimeAsync(20_000);
    const res = await p;
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(3);
  });
  it("gives up after the extra try and returns the 429 so the investor is marked incomplete, not quiet", async () => {
    vi.useFakeTimers();
    const f = vi.fn(async () => new Response("no", { status: 429 }));
    vi.stubGlobal("fetch", f);
    const p = fetchWithRetry("https://example.test/search");
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await p).status).toBe(429);
    expect(f).toHaveBeenCalledTimes(4);
  });
});
