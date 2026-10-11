import { waitUntil } from "@vercel/functions";
import { activeRun, createRun, listProfiles, type RunRow } from "@/lib/db/store";

/** Kick the next batch of a run in the background (chain). Authenticated with CRON_SECRET. */
export function chainBatch(origin: string, runId: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  waitUntil(
    fetch(`${origin}/api/scan/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: runId }),
    }).catch(() => {}),
  );
}

export type StartResult = { ok: true; run: RunRow } | { ok: false; reason: "already_running"; run: RunRow };

export async function startRun(trigger: "scheduled" | "manual"): Promise<StartResult> {
  const active = await activeRun();
  if (active) return { ok: false, reason: "already_running", run: active };
  const profiles = await listProfiles();
  return { ok: true, run: await createRun(trigger, profiles.length) };
}
