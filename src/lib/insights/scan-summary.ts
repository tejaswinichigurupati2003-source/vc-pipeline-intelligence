import type { PipelineRow } from "@/lib/db/read";

/**
 * What the Today numbers count, in one place, so the scan panel and the tiles read the same rows.
 * These are different STAGES, so they are not expected to be equal:
 *   refreshed       investors whose search finished (run.vcs_succeeded); the rest hit a failed or incomplete search and keep old values
 *   newSignals      verified signals stored by that scan that were not already known (run.signals_accepted), NOT the total on file
 *   withNews        investors with at least one verified source dated in the last 30 days (what the score is built from)
 *   ready           of those, not yet contacted and scoring 30 or more (action: reach out)
 *   worthLook       a lighter verified signal (score 1 to 29, action: review)
 *   hold            you are already waiting on a reply, so no outreach is suggested whatever the signal
 */
export interface PipelineSummary {
  tracked: number;
  refreshed: number | null;
  notRefreshed: number;
  newSignals: number | null;
  withNews: number;
  sources: number;
  ready: number;
  worthLook: number;
  hold: number;
  quiet: number;
  needsRefresh: number;
  unscanned: number;
}

type RunLike = { status: string; vcs_targeted: number; vcs_succeeded: number; signals_accepted: number } | null;

export function summarizePipeline(rows: Pick<PipelineRow, "bucket" | "evidence">[], run: RunLike): PipelineSummary {
  const count = (b: string) => rows.filter((r) => r.bucket === b).length;
  const live = rows.filter((r) => r.bucket !== "stale");
  const withSources = live.filter((r) => (r.evidence?.sources30d ?? 0) > 0);
  const finished = !!run && run.status !== "running";
  return {
    tracked: rows.length,
    refreshed: run ? run.vcs_succeeded : null,
    notRefreshed: finished ? Math.max(0, run!.vcs_targeted - run!.vcs_succeeded) : 0,
    newSignals: run ? run.signals_accepted : null,
    withNews: withSources.length,
    sources: withSources.reduce((t, r) => t + (r.evidence?.sources30d ?? 0), 0),
    ready: count("reach_out"),
    worthLook: count("review"),
    hold: count("hold"),
    quiet: count("quiet"),
    needsRefresh: count("stale"),
    unscanned: count("unscanned"),
  };
}
