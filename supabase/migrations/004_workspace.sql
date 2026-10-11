-- 004_workspace.sql : private workspace data (imports, integrations, relationships, intros, materials, feedback).
-- Only NEW tables. Nothing existing is altered. RLS enabled, no policies: server (service-role) access only.

create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- ---- 26.1 import ------------------------------------------------------------------------------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'csv' check (source in ('csv','hubspot')),
  filename text,
  status text not null default 'committed' check (status in ('committed','reverted')),
  mapping jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_vc_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.import_conflicts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.import_batches(id) on delete cascade,
  vc_id uuid references public.vc_pipeline(id) on delete cascade,
  field text not null,
  existing_value text,
  incoming_value text,
  match_basis text not null,
  source text not null default 'csv',
  status text not null default 'pending' check (status in ('pending','kept_existing','used_incoming','ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists import_conflicts_status_idx on public.import_conflicts (status, created_at desc);

-- Extra identifiers used for duplicate detection and email matching (person/firm email, profile URL).
create table if not exists public.vc_contacts (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid not null references public.vc_pipeline(id) on delete cascade,
  person_name text,
  email text,
  profile_url text,
  source text not null default 'user' check (source in ('user','csv','hubspot','gmail','calendar')),
  created_at timestamptz not null default now()
);
create unique index if not exists vc_contacts_email_uidx on public.vc_contacts (lower(email)) where email is not null;
create index if not exists vc_contacts_vc_idx on public.vc_contacts (vc_id);

-- ---- integrations -----------------------------------------------------------------------------
create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider in ('gmail','calendar','hubspot')),
  account_label text,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected','error','disconnected')),
  token_enc text,                       -- AES-256-GCM, never returned to the browser
  config jsonb not null default '{}'::jsonb,
  sync_cursor text,
  last_sync_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now()
);

-- ---- relationships (private connected data + founder notes) -----------------------------------
create table if not exists public.relationship_events (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid references public.vc_pipeline(id) on delete cascade,  -- null = unmatched, awaiting assignment
  kind text not null check (kind in ('email','meeting','note','commitment')),
  provenance text not null check (provenance in ('gmail','calendar','user')),
  external_ref text unique,             -- e.g. gmail:thread:<id>, calendar:<eventId>
  link_url text,                        -- link back to the original thread/event
  state text check (state in ('interested','meeting_requested','deck_requested','awaiting_founder','waiting_for_investor','pass','reconnect_later')),
  state_confidence text check (state_confidence in ('rule','user_confirmed')),
  title text,
  summary text,
  participants text[] not null default '{}',
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists relationship_events_vc_idx on public.relationship_events (vc_id, occurred_at desc);

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid references public.vc_pipeline(id) on delete cascade,
  event_id uuid references public.relationship_events(id) on delete set null,
  text text not null,
  due_at timestamptz,
  status text not null default 'proposed' check (status in ('proposed','open','done','dismissed')),
  who text not null default 'founder' check (who in ('founder','investor')),
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  vc_id uuid references public.vc_pipeline(id) on delete cascade,
  title text,
  start_at timestamptz not null,
  end_at timestamptz,
  guests text[] not null default '{}',
  link_url text,
  included boolean not null default true,
  notes text,
  notes_confirmed boolean not null default false,
  followup_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists calendar_events_start_idx on public.calendar_events (start_at);

-- ---- warm introductions -----------------------------------------------------------------------
create table if not exists public.warm_nodes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('founder','contact','portfolio_founder','vc_partner','vc')),
  label text not null,
  email text,
  company text,
  vc_id uuid references public.vc_pipeline(id) on delete cascade,
  note text,
  source text not null default 'user',
  created_at timestamptz not null default now()
);
create unique index if not exists warm_nodes_vc_uidx on public.warm_nodes (vc_id) where kind = 'vc';
create unique index if not exists warm_nodes_founder_uidx on public.warm_nodes (kind) where kind = 'founder';

create table if not exists public.warm_edges (
  id uuid primary key default gen_random_uuid(),
  from_node uuid not null references public.warm_nodes(id) on delete cascade,
  to_node uuid not null references public.warm_nodes(id) on delete cascade,
  relation_type text not null check (relation_type in ('knows','worked_with','introduced','invested_in','spoke_with')),
  provenance text not null check (provenance in ('user_supplied','contact_match','meeting','communications')),
  confidence numeric(3,2) not null default 0.5 check (confidence between 0 and 1),
  last_observed_at timestamptz,
  user_confirmed boolean not null default false,
  can_act boolean not null default false,       -- may the founder legitimately use this edge?
  visibility text not null default 'founder_only' check (visibility in ('founder_only','team')),
  created_at timestamptz not null default now(),
  unique (from_node, to_node, relation_type)
);

-- ---- materials and diligence ------------------------------------------------------------------
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('claim','document')),
  title text not null,
  claim_text text,
  source_url text,
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.diligence_requests (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid references public.vc_pipeline(id) on delete cascade,
  request_text text not null,
  status text not null default 'open' check (status in ('open','provided','blocked')),
  material_id uuid references public.materials(id) on delete set null,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---- CRM links + feedback ---------------------------------------------------------------------
create table if not exists public.crm_links (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid not null references public.vc_pipeline(id) on delete cascade,
  provider text not null check (provider in ('hubspot')),
  external_id text not null,
  external_type text not null default 'company',
  last_pushed_at timestamptz,
  unique (provider, external_id),
  unique (vc_id, provider)
);

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid references public.vc_pipeline(id) on delete cascade,
  target_type text not null check (target_type in ('signal','action','vc_match','edge','relationship_event')),
  target_id text not null,
  verdict text not null check (verdict in ('dismissed','wrong','corrected','confirmed')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists user_feedback_target_idx on public.user_feedback (target_type, target_id, created_at desc);

alter table public.app_settings enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_conflicts enable row level security;
alter table public.vc_contacts enable row level security;
alter table public.integration_accounts enable row level security;
alter table public.relationship_events enable row level security;
alter table public.commitments enable row level security;
alter table public.calendar_events enable row level security;
alter table public.warm_nodes enable row level security;
alter table public.warm_edges enable row level security;
alter table public.materials enable row level security;
alter table public.diligence_requests enable row level security;
alter table public.crm_links enable row level security;
alter table public.user_feedback enable row level security;
