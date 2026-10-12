-- 007_expansion.sql : company context and investor list expansion. Only NEW tables. RLS on, no policies (server only).

-- One row: the company the founder is raising for (descriptors only; no metrics are needed by expansion).
create table if not exists public.company_profile (
  id text primary key default 'primary',
  name text,
  sector text,
  product_summary text,
  target_customer text,
  geography text[] not null default '{}',
  business_model text,
  stage text,
  fundraising_round text,
  fundraising_amount numeric,
  fundraising_currency text not null default 'USD',
  is_synthetic boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text not null default 'primary',
  document_type text not null check (document_type in ('website','pitch_deck','metrics_report','meeting_notes','other')),
  title text not null,
  content text not null,
  document_date date,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, title)
);

-- Investors the finder has discovered that are not on the founder's list. Nothing is added to vc_pipeline automatically.
create table if not exists public.investor_suggestions (
  id uuid primary key default gen_random_uuid(),
  firm_key text not null unique,            -- normalised name used for de-duplication
  firm_name text not null,
  firm_domain text,
  investor_type text,
  thesis_summary text,
  why_fit text,
  fit_score integer not null check (fit_score between 0 and 100),
  stage_focus text,
  geography text,
  evidence jsonb not null default '[]'::jsonb,   -- [{url,title,quote,date,domain}]
  times_seen integer not null default 1,
  status text not null default 'new' check (status in ('new','added','dismissed')),
  vc_id uuid references public.vc_pipeline(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_run_id uuid,
  decided_at timestamptz
);
create index if not exists investor_suggestions_status_idx on public.investor_suggestions (status, fit_score desc);

create table if not exists public.expansion_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('scheduled','manual')),
  status text not null check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  queries integer not null default 0,
  pages integer not null default 0,
  llm_calls integer not null default 0,
  candidates integer not null default 0,
  suggestions_new integer not null default 0,
  suggestions_updated integer not null default 0,
  error text
);

alter table public.company_profile enable row level security;
alter table public.company_documents enable row level security;
alter table public.investor_suggestions enable row level security;
alter table public.expansion_runs enable row level security;
