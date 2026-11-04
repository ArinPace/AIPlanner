create table public.planner_notification_inbox (
 username text not null references public.planner_accounts(username) on delete cascade,
 id text not null,
 title text not null,
 message text not null,
 kind text not null check (kind in ('source','connection')),
 checked boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(username,id)
);
alter table public.planner_notification_inbox enable row level security;
revoke all on public.planner_notification_inbox from public,anon,authenticated;
grant select,insert,update,delete on public.planner_notification_inbox to service_role;
