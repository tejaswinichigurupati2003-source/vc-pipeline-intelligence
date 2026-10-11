import pLimit from "p-limit";
import { config } from "@/lib/config";
import { bumpCounters, claimVcs, finalizeIfDone, finishItem, getRun, remainingCount, runIsDegraded } from "@/lib/db/store";
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
  const limit = pLimit(config.maxParallelVcs);

  const processOne = async (vc: VcProfile) => {
    try {
      const r = await scanVc(vc, ctx);
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

  while (Date.now() < deadline - 20_000) {
    const claimed = await claimVcs(runId, config.batchSize);
    if (!claimed.length) break;
    await Promise.all(claimed.map((vc) => limit(() => processOne(vc))));
  }

  const final = await finalizeIfDone(runId);
  const remaining = await remainingCount(runId);
  return { processed, remaining, done: final.status !== "running", status: final.status };
}
