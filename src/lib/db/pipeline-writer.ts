import { db } from "./client";

/** The only four columns the signal system may change on vc_pipeline. */
export interface PipelineSignalUpdate {
  last_signal_date: string | null;
  signal_summary: string | null;
  follow_up_score: number; // integer 0..100
  recommended_action: string;
}

/**
 * The single write path into vc_pipeline (CSV import's insert-only route is the sole exception).
 * Calls the narrow Postgres RPC; there is no way to pass any other column.
 */
export async function applyPipelineSignalUpdate(vcId: string, u: PipelineSignalUpdate): Promise<void> {
  const score = Math.round(u.follow_up_score);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error(`follow_up_score out of range: ${u.follow_up_score}`);
  }
  const { error } = await db().rpc("apply_vc_signal_update", {
    p_vc_id: vcId,
    p_last_signal_date: u.last_signal_date,
    p_signal_summary: u.signal_summary,
    p_follow_up_score: score,
    p_recommended_action: u.recommended_action,
  });
  if (error) throw new Error(`apply_vc_signal_update failed: ${error.message}`);
}
