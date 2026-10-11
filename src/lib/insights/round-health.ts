/** Round health: coverage and stage distribution with assumptions shown (spec 26 dashboard). Pure. */

export interface RoundInput {
  vcs: { contact_status: string; follow_up_score: number | null; bucket: string; fit: number }[];
  target: { investorsToContact: number; conversationsNeeded: number };
}

export const DEFAULT_TARGET = { investorsToContact: 40, conversationsNeeded: 8 };

export const ROUND_ASSUMPTIONS = [
  "Targets are placeholders you can change: contact ~40 investors to reach ~8 active conversations (roughly a 1-in-5 conversion). They are not benchmarks.",
  "Coverage counts investors whose status is anything other than 'yet to reach out'.",
  "Stage distribution is your manually maintained contact status, optionally informed by confirmed relationship states.",
  "Pipeline quality counts only investors with a verified signal in the last 30 days and a fresh successful scan.",
];

export function roundHealth(i: RoundInput) {
  const total = i.vcs.length;
  const count = (s: string) => i.vcs.filter((v) => v.contact_status === s).length;
  const dist = { yet_to_reach_out: count("yet_to_reach_out"), waiting_for_response: count("waiting_for_response"), in_conversation: count("in_conversation"), closed: count("closed") };
  const contacted = total - dist.yet_to_reach_out;
  const active = dist.in_conversation;
  const stale = i.vcs.filter((v) => v.bucket === "stale").length;
  const hot = i.vcs.filter((v) => v.bucket === "reach_out").length;
  const strongFit = i.vcs.filter((v) => v.fit >= 70).length;
  const gaps: string[] = [];
  if (contacted < i.target.investorsToContact) gaps.push(`${i.target.investorsToContact - contacted} more investors to contact to reach your target of ${i.target.investorsToContact}.`);
  if (active < i.target.conversationsNeeded) gaps.push(`${i.target.conversationsNeeded - active} more live conversations needed (target ${i.target.conversationsNeeded}).`);
  if (hot === 0 && dist.yet_to_reach_out > 0) gaps.push("No uncontacted investor has a fresh high-scoring signal right now.");
  if (stale > 0) gaps.push(`${stale} investors have stale data (last scan failed).`);
  return {
    total, dist, contacted, active, stale, hotNow: hot, strongFit, gaps,
    coveragePct: total ? Math.round((contacted / total) * 100) : 0,
    conversionPct: contacted ? Math.round((active / contacted) * 100) : 0,
  };
}
