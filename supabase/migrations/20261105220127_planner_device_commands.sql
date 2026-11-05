create table public.planner_device_commands (
 id uuid primary key default gen_random_uuid(),
 username text not null references public.planner_accounts(username) on delete cascade,
 request_key text not null check(length(request_key) between 1 and 120),
 command jsonb not null, status text not null default 'queued' check(status in ('queued','running','completed','failed','cancelled')),
 result jsonb,created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '2 minutes',
 unique(username,request_key)
);
create index planner_device_commands_pending on public.planner_device_commands(username,created_at) where status='queued';
alter table public.planner_device_commands enable row level security;
revoke all on public.planner_device_commands from public,anon,authenticated;
grant all on public.planner_device_commands to service_role;
