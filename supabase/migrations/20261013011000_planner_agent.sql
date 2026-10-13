alter table public.planner_calendars add column if not exists revision bigint not null default 0;

create table if not exists public.planner_agent_settings (
  username text primary key references public.planner_accounts(username) on delete cascade,
  schedule_enabled boolean not null default false,
  sources jsonb not null default '["brightspace"]',
  profile_id uuid,
  login_browser_id uuid,
  login_url text,
  updated_at timestamptz not null default now()
);
create table if not exists public.planner_agent_runs (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.planner_accounts(username) on delete cascade,
  kind text not null check (kind in ('sync','chat','login')),
  trigger text not null default 'manual',
  status text not null default 'starting',
  task text not null,
  provider_id uuid,
  session_id uuid,
  browser_id uuid,
  live_url text,
  summary text,
  error text,
  updates jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  schedule_slot text,
  unique(username,schedule_slot)
);
create unique index if not exists planner_agent_one_active_sync on public.planner_agent_runs(username)
  where kind='sync' and status in ('starting','running','applying');
create index if not exists planner_agent_runs_user_date on public.planner_agent_runs(username,created_at desc);
create table if not exists public.planner_agent_messages (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.planner_accounts(username) on delete cascade,
  role text not null check(role in ('user','assistant')),
  content text not null,
  run_id uuid references public.planner_agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.planner_connections (
  username text not null references public.planner_accounts(username) on delete cascade,
  provider text not null check(provider in ('google','openai')),
  identity text not null,
  credentials text not null,
  updated_at timestamptz not null default now(),
  primary key(username,provider)
);
create table if not exists public.planner_oauth_attempts (
  state_hash text primary key,
  username text not null references public.planner_accounts(username) on delete cascade,
  provider text not null,
  verifier text not null,
  nonce text not null,
  browser_hash text not null,
  expires_at timestamptz not null
);
alter table public.planner_agent_settings enable row level security;
alter table public.planner_agent_runs enable row level security;
alter table public.planner_agent_messages enable row level security;
alter table public.planner_connections enable row level security;
alter table public.planner_oauth_attempts enable row level security;
revoke all on public.planner_agent_settings, public.planner_agent_runs, public.planner_agent_messages, public.planner_connections, public.planner_oauth_attempts from anon,authenticated;
grant select,insert,update,delete on public.planner_agent_settings, public.planner_agent_runs, public.planner_agent_messages, public.planner_connections, public.planner_oauth_attempts to service_role;

-- Commit calendar changes, Files changes, and the run marker together, preserving concurrent user edits.
create or replace function public.planner_apply_sync(
  p_username text, p_run uuid, p_calendar_revision bigint, p_files_revision bigint,
  p_calendar jsonb, p_files jsonb, p_summary text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from planner_agent_runs where id=p_run and username=p_username and applied_at is null for update;
  if not found then return false; end if;
  perform 1 from planner_calendars where username=p_username and revision=p_calendar_revision for update;
  if not found then raise exception 'concurrent calendar edit' using errcode='40001'; end if;
  perform 1 from planner_files where username=p_username and revision=p_files_revision for update;
  if not found then raise exception 'concurrent files edit' using errcode='40001'; end if;
  update planner_calendars set state=p_calendar,revision=revision+1,updated_at=now() where username=p_username;
  update planner_files set state=p_files,revision=revision+1,updated_at=now() where username=p_username;
  update planner_agent_runs set status='succeeded',summary=p_summary,applied_at=now(),finished_at=now() where id=p_run and username=p_username;
  return true;
end $$;
revoke all on function public.planner_apply_sync(text,uuid,bigint,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.planner_apply_sync(text,uuid,bigint,bigint,jsonb,jsonb,text) to service_role;
