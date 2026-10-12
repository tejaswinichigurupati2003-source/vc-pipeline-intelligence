-- People associated with each investor (partners and team), and a per-scan score history for trend analysis.
-- New tables plus two new nullable columns on the scanner's own evidence table. Nothing else is altered.

create table if not exists public.vc_people (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid not null references public.vc_pipeline(id) on delete cascade,
  name text not null,
  name_key text not null,
  role text,
  source text not null check (source in ('investor_row','signal','manual')),
  source_url text,
  source_quote text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (vc_id, name_key)
);
create index if not exists vc_people_vc_idx on public.vc_people (vc_id) where active;

create table if not exists public.vc_score_history (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid not null references public.vc_pipeline(id) on delete cascade,
  run_id uuid not null,
  scored_at timestamptz not null default now(),
  score integer not null check (score between 0 and 100),
  counted_signals integer not null default 0,
  signals_180d integer not null default 0,
  momentum text,
  backfilled boolean not null default false,
  unique (run_id, vc_id)
);
create index if not exists vc_score_history_vc_idx on public.vc_score_history (vc_id, scored_at desc);

alter table public.vc_signals add column if not exists person_name text;
alter table public.vc_signals add column if not exists person_role text;

alter table public.vc_people enable row level security;
alter table public.vc_score_history enable row level security;
