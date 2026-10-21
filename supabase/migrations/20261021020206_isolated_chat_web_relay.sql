create table public.planner_chat_web_relay (
 id uuid primary key,
 username text not null references public.planner_accounts(username) on delete cascade,
 message text not null check(length(message) between 1 and 12000),
 reply text not null default '',
 status text not null default 'queued' check(status in ('queued','running','completed','failed')),
 error text,lease uuid,lease_until timestamptz,
 created_at timestamptz not null default now(),finished_at timestamptz
);
create index planner_chat_web_relay_history on public.planner_chat_web_relay(username,created_at desc);
create unique index planner_chat_web_relay_one_active on public.planner_chat_web_relay(username) where status in ('queued','running');
alter table public.planner_chat_web_relay enable row level security;
revoke all on public.planner_chat_web_relay from public,anon,authenticated;
grant select,insert,update,delete on public.planner_chat_web_relay to service_role;
