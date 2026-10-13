-- Account data is available only to the trusted API, never to public Data API clients.
create table if not exists public.planner_accounts (
  username text primary key check (username ~ '^[a-z0-9_]{3,24}$'),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.planner_sessions (
  token_hash text primary key,
  username text not null references public.planner_accounts(username) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists planner_sessions_username_idx on public.planner_sessions(username);
create index if not exists planner_sessions_expiry_idx on public.planner_sessions(expires_at);
create table if not exists public.planner_calendars (
  username text primary key references public.planner_accounts(username) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.planner_files (
  username text primary key references public.planner_accounts(username) on delete cascade,
  state jsonb not null default '{"folders":[],"files":[],"documents":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.planner_uploads (
  id uuid primary key,
  username text not null references public.planner_accounts(username) on delete cascade,
  folder_id text not null,
  name text not null,
  size bigint not null check (size between 1 and 26214400),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending','complete','deleted')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);
create index if not exists planner_uploads_username_idx on public.planner_uploads(username);

alter table public.planner_accounts enable row level security;
alter table public.planner_sessions enable row level security;
alter table public.planner_calendars enable row level security;
alter table public.planner_files enable row level security;
alter table public.planner_uploads enable row level security;
revoke all on public.planner_accounts, public.planner_sessions, public.planner_calendars, public.planner_files, public.planner_uploads from anon, authenticated;
grant select, insert, update, delete on public.planner_accounts, public.planner_sessions, public.planner_calendars, public.planner_files, public.planner_uploads to service_role;

-- PDFs are private and accessible only through short-lived, account-scoped signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('planner-pdfs', 'planner-pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
