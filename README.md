# VC Fundraising Pipeline Intelligence

**Live:** https://vc-pipeline-intelligence-two.vercel.app  ·  **Repo:** https://github.com/tejaswinichigurupati2003-source/vc-pipeline-intelligence

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

Dry-run discovery without Supabase or Gemini (needs only `LANGSEARCH_API_KEY`): `npx tsx --env-file=.env.local scripts/discover.mts Blume Dynamo`.

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

## Workspace features and integrations

There is one app (no separate public/shared view). Sign in with your `ADMIN_TOKEN` (HttpOnly, SameSite=Strict session cookie), or set `WORKSPACE_AUTH=off` to remove the login (fine on localhost; on a public URL it exposes your notes and connected accounts). Old `/workspace/*` and `/vc/*` links redirect to the new routes.

| Area | What it does |
|---|---|
| **Today** | 3-7 prioritised actions grouped by type (reply, commitments due, post-meeting, meeting prep, reach out, follow up). Each says why, shows whether it is *verified / inferred / yours*, can be dismissed for 14 days, and a "why these and not others" panel lists suppressed alternatives. |
| **Pipeline** | Fit, timing signal, relationship state, next action, source freshness (last *successful* scan). |
| **Signals** | Chronological verified evidence with source, dates, confidence and a "mark wrong" control. |
| **Timeline** | Selected Gmail threads, investor meetings, commitments (proposed ones need your confirmation) and your notes; correct a state or a wrong investor match, delete records. |
| **Intros** | Possible introduction paths from *your* contacts only; edges carry provenance, confidence, last-seen, can-act flag; unconfirmed edges are capped and never actionable. |
| **Materials** | Company claims/documents (only **approved** items reach drafts and briefs), investor diligence requests. |
| **Round health** | Coverage, stage distribution, gaps vs your targets, with assumptions listed. |
| **Integrations** | Gmail, Calendar: scopes, account, last sync, errors, choose scope, disconnect, delete imported data. |
| **Import / export** | CSV import with column mapping, dry run, duplicate detection (name, email, profile URL, firm), blank-fill, conflict resolution, undo, CSV export of pipeline and evidence. |

### Setup for the workspace
```bash
npm run migrate -- supabase/migrations/004_workspace.sql supabase/migrations/005_user_rpcs.sql   # needs SUPABASE_ACCESS_TOKEN, or paste the SQL in the Supabase editor
```
Set `INTEGRATION_ENC_KEY` (and `APP_URL`) in `.env.local`/Vercel. Gmail and Calendar additionally need a Google Cloud OAuth client: enable the Gmail API and Google Calendar API, create a Web OAuth client with redirect URI `{APP_URL}/api/integrations/google/callback`, keep the consent screen in Testing mode and add yourself as a test user. `gmail.metadata` is a restricted scope, so offering this to other people requires Google's verification.

### Design rules for the new features
- **Import never overwrites.** Merge rules: match on investor+firm, then email, then profile URL; fill blank fields only; differing values become conflicts you resolve; identical values do nothing. A re-import is a no-op. All writes to `vc_pipeline` go through allow-listed Postgres functions (`005_user_rpcs.sql`) that cannot touch the four signal columns. The scanner never imports that code (enforced by tests).
- **Gmail:** least privilege (`gmail.metadata` + `gmail.compose`). Reads headers, labels and snippets of the labels you pick, never full bodies. Creates **drafts only**; there is no send code or send scope anywhere (a test fails the build if one appears). Relationship states (`interested`, `meeting_requested`, `deck_requested`, `awaiting_founder`, `waiting_for_investor`, `pass`, `reconnect_later`) come from transparent rules and are marked *inferred* until you confirm them. Dated commitments are *proposed* for you to confirm. No email content is sent to Gemini.
- **Calendar:** read-only, selected calendars only, incremental sync tokens, and only events whose guests match a tracked investor are stored; you can exclude or delete any event.
- **Contacts and intros:** user-supplied contact CSV and optional, off-by-default meeting-derived edges (confidence 0.3, unconfirmed, not actionable). Language is "possible introduction path" until you confirm.
- **Drafts and briefs** are deterministic templates over verified signals and *approved* claims: no model-written claims.
- OAuth `state` is signed, expiring and bound to a browser nonce cookie; tokens are AES-256-GCM encrypted and never returned to the browser.

### Components Map additions
| # | Component | Path |
|---|---|---|
| 19 | Admin session auth | `src/lib/auth.ts`, `src/app/api/auth/login/route.ts` |
| 20 | Import mapping + planner (dry run, merge rules) | `src/lib/importer/{mapping,plan,service}.ts`, `src/app/api/import/{preview,commit,conflicts,revert}/route.ts` |
| 21 | User-initiated writer (allow-listed RPCs) | `src/lib/db/user-writer.ts`, `supabase/migrations/005_user_rpcs.sql` |
| 22 | Export | `src/lib/export.ts`, `src/app/api/export/route.ts` |
| 23 | Google OAuth + Gmail + Calendar | `src/lib/google/{oauth,gmail,calendar}.ts`, `src/app/api/integrations/google/**` |
| 24 | Relationship rules (state, commitments, matching) | `src/lib/relationships/*` |
| 26 | Warm-intro graph and path finder | `src/lib/intros/{paths,service}.ts`, `src/app/api/intros/route.ts` |
| 27 | Today, fit, round health, briefs, drafts | `src/lib/insights/*`, `src/app/api/drafts/route.ts`, `src/app/api/meetings/[id]/route.ts` |
| 28 | Workspace mutations (allow-listed) | `src/lib/workspace/entities.ts`, `src/app/api/workspace/route.ts` |
| 29 | Workspace UI | `src/app/workspace/**`, `src/components/*` |

### What is and is not verified
Unit-tested offline: import planner, classifier, commitments, matching, MIME building, encryption/OAuth state, auth/CSRF, allow-lists, today/brief/draft/round logic, intro paths, and the write-boundary and never-send guards. Not exercised against live third-party accounts (needs your credentials): Google OAuth/Gmail/Calendar and  calls. They follow the documented APIs, but expect to fix small field-level surprises on first connection.
## Interface

One app called **Raise**: a left sidebar, a top bar (round progress, search, last-scan status, Refresh) and a stage board of investors.

| Route | Sidebar item | What it is |
|---|---|---|
| `/` | **Today** | Short prioritised action list with a reason for each, plus "Skipped, and why". |
| `/round` | **Round overview** | Coverage, stage distribution, gaps against your targets, assumptions. |
| `/investors` | **Investors** | The board (To contact, Awaiting reply, In conversation, Closed). Drag a card to change its stage; filter by signal strength; list view. |
| `/investors/[id]` | | One investor: signal strength, fit, recommended next step, private notes, draft, intro paths, unified timeline. |
| `/signals` | **Market signals** | Verified public evidence, newest first. |
| `/conversations` | **Conversations** | Selected email threads, meetings, commitments and your notes. |
| `/intros` | **Warm intros** | Possible introduction paths from your own contacts. |
| `/data-room` | **Data room** | Company profile, approved claims and documents, investor diligence requests. |
| `/integrations`, `/import` | **Integrations**, **Import & export** | Gmail, Calendar; CSV import with dry run, conflicts and undo. |

### Design
Flat and hard-edged: zero border radius, 1px crisp borders, no soft shadows (hover uses a hard-offset block shadow), a faint blueprint grid on the page, and cherry-brown gradients with a diagonal hatch on key surfaces. Headlines use **Panchang**, data and paragraphs use **General Sans** (both from Fontshare, loaded with one `<link>` per family because their API drops the second family when two are combined). Tokens live in `tailwind.config.ts` (palette, radius, shadow) and `src/app/globals.css` (type scale, form controls, `.card`, `.btn`, `.grad-cherry`, `.blueprint`).

- Stored machine strings (for example `REACH OUT: cite the recent sector signal`) are kept as the spec defines; `src/lib/view/labels.ts` turns them into product vocabulary ("Reach out", "Check timing", "Hold"). A failed scan is always shown as *Needs refresh*, never as quiet.
- Moving a card calls `POST /api/investors/status` (allow-listed RPC `user_set_contact_status`, migration `006_stage_move.sql`): it changes `contact_status` only, stamps `last_contact_at` the first time you move an investor to *Awaiting reply*, and never touches notes or the four signal columns.
- `npm run warm -- http://localhost:3000` pre-compiles every route in dev, avoiding a dev-only `ChunkLoadError` when a page is requested mid-compile.