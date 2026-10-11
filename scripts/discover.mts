/**
 * Phase-2 check: prints deduped, prefiltered candidates for a few VCs using LIVE search.
 * Usage: npx tsx --env-file=.env.local scripts/discover.ts [firm name substring ...]
 * Needs LANGSEARCH_API_KEY only (no Supabase, no Gemini).
 */
import { readFileSync } from "node:fs";
import { buildQueries } from "../src/lib/discovery/query-builder";
import { dedupeAndRank, prefilter } from "../src/lib/discovery/normalize";
import { parseCsv, toImportRows } from "../src/lib/import-csv";
import { googleNews } from "../src/lib/providers/google-news-rss";
import { langSearch } from "../src/lib/providers/langsearch";
import type { VcProfile } from "../src/lib/types";

const wanted = process.argv.slice(2);
const { rows } = toImportRows(parseCsv(readFileSync("seed/vcs.csv", "utf8")));
const picks = (wanted.length ? rows.filter((r) => wanted.some((w) => r.firm_name.toLowerCase().includes(w.toLowerCase()))) : rows.slice(0, 3)).slice(0, 5);

for (const r of picks) {
  const vc: VcProfile = {
    id: "dry-run", investor_name: r.investor_name, firm_name: r.firm_name, firm_domain: r.firm_domain,
    investment_thesis: r.investment_thesis, sector_keywords: r.sector_keywords, aliases: [],
    contact_status: "yet_to_reach_out", last_contact_at: null,
  };
  console.log(`\n=== ${vc.firm_name} ===`);
  const raw = [];
  for (const q of buildQueries(vc)) {
    try {
      const got = q.provider === "langsearch" ? await langSearch(q.query) : await googleNews(q.query);
      console.log(`${q.id} [${q.provider}] ${got.length} results :: ${q.query}`);
      raw.push(...got);
    } catch (e) {
      console.log(`${q.id} FAILED :: ${(e as Error).message}`);
    }
  }
  const kept = dedupeAndRank(raw, vc, 999).filter((c) => prefilter(c, vc, new Date(), new Set()).keep);
  for (const c of dedupeAndRank(kept, vc, 6)) console.log(`  - ${c.providerDate?.slice(0, 10) ?? "no date"} | ${c.sourceDomain} | ${c.title}\n    ${c.url}`);
}
