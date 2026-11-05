create table public.planner_cloud_dns (
 username text primary key references public.planner_accounts(username) on delete cascade,
 profile text not null check(profile ~ '^[a-fA-F0-9]{6}$'),
 credentials text not null,updated_at timestamptz not null default now()
);
alter table public.planner_cloud_dns enable row level security;
revoke all on public.planner_cloud_dns from public,anon,authenticated;
grant all on public.planner_cloud_dns to service_role;
