# VC Fundraising Pipeline Intelligence

MESA Cohort C4, Problem Statement 10. Twice a week, tells Vikram (first-time founder, Seed, B2B logistics SaaS) which of his ~50 VCs are worth contacting **this week**, with a source link and date from the last 30 days, and which are **quiet**.

> Search discovers candidates. Code pre-filters them. Gemini classifies the evidence. Code validates dates and identity. Deterministic code scores. A single narrow database function writes four columns.

Full design: [SPEC.md](SPEC.md). Stack: Next.js 15 (App Router, TS) on Vercel, Supabase Postgres, Gemini Flash (`@google/genai`), LangSearch, Google News RSS and known RSS/Atom feeds.

## Setup

1. **Supabase**: create a free project. In the SQL editor run `supabase/migrations/001_schema.sql`, then `002_safe_update.sql`. Copy the project URL and the service-role key.
2. **Gemini**: create a key in Google AI Studio, pick a current Flash model ID, set `GEMINI_MODEL`.
3. **LangSearch**: create a key in its dashboard.
4. `cp .env.example .env.local`, fill it in. Generate secrets with `openssl rand -hex 32` for `CRON_SECRET` and `ADMIN_TOKEN`.
5. `npm install`, `npm run dev`.
6. **Import the 50 VCs** (insert-only, never overwrites existing rows):
   ```bash
   curl -X POST http://localhost:3000/api/import -H "x-admin-token: $ADMIN_TOKEN" --data-binary @seed/vcs.csv
   ```
7. Open the dashboard, click **Refresh**, enter the admin token, watch the run complete. Check the "Rejected candidates" list on a VC page to sanity-check the filters.
8. **Deploy**: push to GitHub, import in Vercel, add every variable from `.env.example` to Production, deploy. Keep Deployment Protection off for the production URL (the batch self-call and cron need it). The cron (`vercel.json`, Tue and Fri 01:00 UTC, about 06:30 IST) runs on production only.

Dry-run discovery without Supabase or Gemini (needs only `LANGSEARCH_API_KEY`): `npx tsx --env-file=.env.local scripts/discover.ts Blume Dynamo`.

## Tests

```bash
npm test          # 96 unit/golden tests, no network
npm run typecheck
```

Live manual-column regression (writes synthetic values to the four signal columns, so use a test project or accept a re-scan afterwards):

```bash
REGRESSION_ALLOW_WRITE=1 npm test -- safe-write
```

`tests/safe-write.test.ts` also fails the build if any code outside the CSV import touches `vc_pipeline` with `update/upsert/delete`, if the RPC is called anywhere but `pipeline-writer.ts`, if the scanner selects `contact_history`/`personal_notes`, or if `claude`/`anthropic` appears in `src`.

## Safe write boundary

The system writes only `last_signal_date`, `signal_summary`, `follow_up_score`, `recommended_action`, only through the RPC `apply_vc_signal_update`. A failed or inconclusive scan never calls it, so old values survive. Gemini never sees `contact_status`, `last_contact_at`, `contact_history` or `personal_notes`.

## Components Map

| # | Component | Purpose | Tech | Uses AI? | Live data? | Path |
|---|---|---|---|---|---|---|
| 1 | Pipeline dashboard | Buckets (reach out / review / hold / quiet / stale), table view, run banner | Next.js + Tailwind | No | Reads live scan results | `src/app/page.tsx` |
| 2 | VC detail | Evidence timeline, per-signal points, rejects, run history, mark wrong | Next.js | No | Yes (source links) | `src/app/vc/[id]/page.tsx` |
| 3 | Scheduler | Tue/Fri trigger | Vercel Cron | No | n/a | `vercel.json`, `src/app/api/cron/scan/route.ts` |
| 4 | Manual refresh | Admin-token run + resume | Route handler | No | n/a | `src/app/api/scan/start/route.ts`, `src/components/RefreshControls.tsx` |
| 5 | Batch orchestrator | Claims VCs, time budget, self-continues, finalises run | Route handler + `waitUntil` | No | n/a | `src/app/api/scan/batch/route.ts`, `src/lib/scan/batch.ts`, `src/lib/scan/scan-vc.ts` |
| 6 | Query builder | Deterministic query templates | TypeScript | No | n/a | `src/lib/discovery/query-builder.ts` |
| 7 | LangSearch adapter | Open-web search, `freshness: oneMonth` | fetch | No | **Yes** | `src/lib/providers/langsearch.ts` |
| 8 | Google News RSS adapter | Recent news, `when:30d` | fetch + fast-xml-parser | No | **Yes** | `src/lib/providers/google-news-rss.ts` |
| 9 | Known-source monitor | Firm/partner feeds from `vc_sources` | RSS/Atom | No | **Yes** | `src/lib/providers/feed-monitor.ts`, `feed.ts` |
| 10 | Normaliser, deduper, pre-filter | Canonical URLs, name/date/blocklist filter, event keys | TypeScript | No | n/a | `src/lib/discovery/normalize.ts` |
| 11 | Safe page fetcher | SSRF guard, limits, robots, text and date extraction | fetch + cheerio | No | **Yes** | `src/lib/discovery/fetch-page.ts` |
| 12 | **Evidence classifier** | Identity, signal type, relevance, quote | **Gemini Flash** + zod | **Yes** | Analyses live pages | `src/lib/verification/classify.ts`, `prompt.ts` |
| 13 | Evidence validator | Quote-in-source, dates, thresholds, rules-only mode | TypeScript | No | n/a | `src/lib/verification/validate.ts` |
| 14 | Scoring engine | Reproducible 0-100 score | Pure functions | No | n/a | `src/lib/scoring/score.ts` |
| 15 | Action recommender + summary | Relationship-aware action, templated summary | Pure functions | No | n/a | `src/lib/scoring/recommend.ts` |
| 16 | Safe writer | Updates only 4 columns | Postgres RPC | No | n/a | `supabase/migrations/002_safe_update.sql`, `src/lib/db/pipeline-writer.ts` |
| 17 | Evidence + run store | Signals, candidates, runs, items | Supabase Postgres | No | n/a | `supabase/migrations/001_schema.sql`, `src/lib/db/store.ts`, `read.ts` |
| 18 | CSV import | Insert-only load | Route handler | No | n/a | `src/app/api/import/route.ts`, `src/lib/import-csv.ts` |

Only #12 uses AI (Gemini Flash). Everything else is deterministic and auditable.

## Implementation notes and small deviations from the spec

- **Partial scans.** If some queries fail but a signal was found in the window, the four columns are still written (the score is a lower bound from real evidence). If some queries failed and nothing was found, the item is `partial`, nothing is written, and the dashboard shows DATA STALE rather than quiet.
- **Import is select-then-insert**, not `ON CONFLICT`, because the uniqueness index is on `lower(...)` expressions that PostgREST cannot target.
- **`bump_run_counters`** (in `001_schema.sql`) is an extra small RPC so concurrent batches can increment run counters atomically. It touches `signal_runs` only.
- **Google News links** are redirect URLs; those items go straight to headline-only evidence (confidence capped at medium), with the publisher domain taken from the feed's `<source>` tag.
- **Next.js config** adds an explicit webpack alias for `@/`, and TypeScript is pinned to 6.x because Next 15 does not support TypeScript 7.
- The seed CSV uses firm names in `investor_name`, so partner-specific queries (Q1, Q5) are skipped for those rows. Add partner names to enable them.

## Known limitations

- Free quotas: Gemini free tier and the LangSearch daily allowance. When Gemini is exhausted the run continues in **rules-only** mode (badge shown); when LangSearch fails a VC is marked stale, not quiet.
- Search coverage gaps: LinkedIn, X and aggregators are deliberately excluded, and paywalled or JS-only pages cannot be read. **Quiet means "not found by the system", not "inactive".**
- The scoring weights are starting hypotheses, not proven predictors of replies.
- Hobby cron fires within the scheduled hour, not at an exact minute.
- DNS is resolved and checked before each fetch hop, but the fetch itself re-resolves the hostname, so a DNS-rebinding race is theoretically possible.
