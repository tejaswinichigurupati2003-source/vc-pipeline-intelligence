-- 001_schema.sql : tables for VC Fundraising Pipeline Intelligence
-- RLS is enabled on every table with NO policies: only the server (service-role key) can access.

create table if not exists public.vc_pipeline (
  id uuid primary key default gen_random_uuid(),
  investor_name text not null,
  firm_name text not null,
  firm_domain text,
  investment_thesis text,
  sector_keywords text[] default '{}',
  aliases text[] default '{}',

  -- MANUAL columns: the signal system must never write these
  contact_status text not null default 'yet_to_reach_out'
    check (contact_status in ('yet_to_reach_out','waiting_for_response','in_conversation','closed')),
  last_contact_at timestamptz,
  contact_history text,
  personal_notes text,

  -- SIGNAL-DERIVED columns: the ONLY columns the system may write
  last_signal_date timestamptz,
  signal_summary text,
  follow_up_score integer check (follow_up_score between 0 and 100),
  recommended_action text,

  created_at timestamptz not null default now()
);
alter table public.vc_pipeline enable row level security;
create unique index if not exists vc_pipeline_investor_firm_uidx
  on public.vc_pipeline (lower(investor_name), lower(firm_name));

create table if not exists public.vc_sources (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid references public.vc_pipeline(id) on delete cascade,
  feed_url text not null,
  source_type text not null check (source_type in ('firm_blog','investor_blog','newsroom','podcast','youtube','other')),
  active boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  unique (vc_id, feed_url)
);

create table if not exists public.vc_signals (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid not null references public.vc_pipeline(id) on delete cascade,
  title text not null,
  source_url text not null,
  canonical_url text not null,
  source_domain text not null,
  source_tier text not null check (source_tier in ('primary','secondary','unknown')),
  evidence_basis text not null default 'full_page'
    check (evidence_basis in ('full_page','headline_only')),
  signal_type text not null check (signal_type in (
    'investor_thesis','portfolio_investment','investor_commentary',
    'event_appearance','fund_activity','portfolio_activity','other')),
  published_at timestamptz,
  event_at timestamptz,
  date_basis text,
  discovered_at timestamptz not null default now(),
  evidence_summary text not null,
  evidence_quote text,
  relevance_score numeric(4,3) not null check (relevance_score between 0 and 1),
  confidence text not null check (confidence in ('high','medium','low')),
  verification_status text not null default 'accepted'
    check (verification_status in ('accepted','needs_review','superseded','rejected_by_user')),
  event_key text not null,
  classifier_version text,
  created_at timestamptz not null default now(),
  unique (vc_id, event_key)
);
create index if not exists vc_signals_vc_date_idx
  on public.vc_signals (vc_id, coalesce(event_at, published_at) desc);

create table if not exists public.signal_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  vc_id uuid not null references public.vc_pipeline(id) on delete cascade,
  url text not null,
  canonical_url text not null,
  title text,
  provider text not null,
  outcome text not null check (outcome in (
    'accepted','rejected_prefilter','rejected_wrong_entity','rejected_stale',
    'rejected_low_relevance','rejected_no_evidence','duplicate','needs_review',
    'fetch_failed','llm_unavailable')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists signal_candidates_vc_idx on public.signal_candidates (vc_id, created_at desc);

create table if not exists public.signal_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('scheduled','manual')),
  status text not null check (status in ('running','completed','partial','failed')),
  lookback_days integer not null default 30,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  vcs_targeted integer not null default 0,
  vcs_succeeded integer not null default 0,
  vcs_failed integer not null default 0,
  queries_executed integer not null default 0,
  llm_calls integer not null default 0,
  signals_accepted integer not null default 0,
  error_summary text,
  app_version text
);

create table if not exists public.signal_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.signal_runs(id) on delete cascade,
  vc_id uuid not null references public.vc_pipeline(id) on delete cascade,
  status text not null check (status in ('running','success','no_verified_signal','failed','partial')),
  scan_mode text not null default 'llm' check (scan_mode in ('llm','rules_only')),
  queries_executed integer not null default 0,
  candidates_found integer not null default 0,
  signals_accepted integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (run_id, vc_id)
);

alter table public.vc_sources enable row level security;
alter table public.vc_signals enable row level security;
alter table public.signal_candidates enable row level security;
alter table public.signal_runs enable row level security;
alter table public.signal_run_items enable row level security;

-- Atomic counter bump used by the batch orchestrator (avoids read-modify-write races between batches).
create or replace function public.bump_run_counters(
  p_run_id uuid,
  p_succeeded integer,
  p_failed integer,
  p_queries integer,
  p_llm_calls integer,
  p_signals integer
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.signal_runs
     set vcs_succeeded = vcs_succeeded + p_succeeded,
         vcs_failed = vcs_failed + p_failed,
         queries_executed = queries_executed + p_queries,
         llm_calls = llm_calls + p_llm_calls,
         signals_accepted = signals_accepted + p_signals
   where id = p_run_id;
$$;
revoke all on function public.bump_run_counters(uuid, integer, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.bump_run_counters(uuid, integer, integer, integer, integer, integer) to service_role;
