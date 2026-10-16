create table if not exists public.planner_google_accounts (
 id uuid primary key default gen_random_uuid(),
 username text not null references public.planner_accounts(username) on delete cascade,
 google_sub text not null,
 identity text not null,
 credentials text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(username,google_sub)
);
alter table public.planner_google_accounts enable row level security;
revoke all on public.planner_google_accounts from anon,authenticated;
grant all on public.planner_google_accounts to service_role;
alter table public.planner_vm_settings add column if not exists google_account_id uuid references public.planner_google_accounts(id) on delete set null;
