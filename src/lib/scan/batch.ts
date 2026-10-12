import { config } from "@/lib/config";
import { bumpCounters, makeClaimer, finalizeIfDone, finishItem, getRun, remainingCount, runIsDegraded } from "@/lib/db/store";
import type { VcProfile } from "@/lib/types";
import { scanVc, type RunContext } from "./scan-vc";

export interface BatchOutcome {
  processed: number;
  remaining: number;
  done: boolean;
  status: string;
}

/**
 * Process the next unclaimed VCs of a run within the time budget (spec 11.2).
 * A failure for one VC is recorded on its item and never stops the others; it never writes vc_pipeline.
 */
export async function runBatch(runId: string): Promise<BatchOutcome> {
  const started = Date.now();
  const deadline = started + (config.maxDurationSec - 15) * 1000;
  // Stop claiming new investors while there is still room for a whole claimed batch to finish (and the run to be finalised).
  const reserveMs = Math.min(90_000, (deadline - started) * 0.4);
  const run = await getRun(runId);
  if (!run) throw new Error("run not found");
  if (run.status !== "running") return { processed: 0, remaining: 0, done: true, status: run.status };

  let llmCalls = run.llm_calls;
  let degraded = await runIsDegraded(runId);
  const ctx: RunContext = {
    runId,
    startedAt: new Date(run.started_at),
    llmCallsUsed: () => llmCalls,
    addLlmCalls: (n) => { llmCalls += n; },
    isDegraded: () => degraded,
    markDegraded: () => { degraded = true; },
  };

  let processed = 0;

  const processOne = async (vc: VcProfile) => {
    try {
      // One slow site must never hold up a whole batch: give each investor a hard cap.
      const r = await Promise.race([
        scanVc(vc, ctx),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("scan timed out after 80s")), 80_000)),
      ]);
      await finishItem(runId, vc.id, {
        status: r.status,
        scan_mode: r.scanMode,
        queries_executed: r.queries,
        candidates_found: r.candidates,
        signals_accepted: r.accepted,
        error_code: r.errorCode,
        error_message: r.errorMessage,
      });
      const ok = r.status === "success" || r.status === "no_verified_signal";
      await bumpCounters(runId, { succeeded: ok ? 1 : 0, failed: ok ? 0 : 1, queries: r.queries, llmCalls: r.llmCalls, signals: r.accepted });
    } catch (e) {
      await finishItem(runId, vc.id, {
        status: "failed", scan_mode: "llm", queries_executed: 0, candidates_found: 0, signals_accepted: 0,
        error_code: "exception", error_message: (e as Error).message.slice(0, 500),
      }).catch(() => {});
      await bumpCounters(runId, { failed: 1 }).catch(() => {});
    }
    processed++;
  };

  // Worker pool: a fixed number of investors are in flight at all times, and a finished worker immediately takes the next
  // one (no waiting for the slowest of a wave). Workers stop taking new investors when the time budget is nearly spent.
  const nextVc = await makeClaimer(runId);
  const worker = async () => {
    while (Date.now() < deadline - reserveMs) {
      const vc = await nextVc();
      if (!vc) return;
      await processOne(vc);
    }
  };
  await Promise.all(Array.from({ length: config.maxParallelVcs }, worker));

  const final = await finalizeIfDone(runId);
  const remaining = await remainingCount(runId);
  return { processed, remaining, done: final.status !== "running", status: final.status };
}
