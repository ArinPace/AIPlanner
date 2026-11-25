create table public.planner_chat_app_accounts (
 username text not null references public.planner_accounts(username) on delete cascade,
 email text not null check (length(email) between 3 and 254),
 read_verified boolean not null default false,
 write_tools jsonb not null default '[]'::jsonb check (jsonb_typeof(write_tools)='array'),
 verified_at timestamptz not null default now(),
 primary key (username,email)
);
alter table public.planner_chat_app_accounts enable row level security;
revoke all on public.planner_chat_app_accounts from anon,authenticated;
grant all on public.planner_chat_app_accounts to service_role;
