create table public.planner_subscription_tool_turns (
 id uuid primary key,
 username text not null,
 chat_id uuid not null,
 prompt_digest text not null,
 status text not null default 'running' check(status in ('running','completed','cancelled')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '2 hours'),
 unique(id,username),
 foreign key(chat_id,username) references public.planner_subscription_chats(id,username) on delete cascade
);
create unique index planner_subscription_active_tool_turn on public.planner_subscription_tool_turns(username,chat_id) where status='running';
create table public.planner_subscription_tool_calls (
 turn_id uuid not null,
 username text not null,
 call_id text not null check(length(call_id) between 1 and 120),
 request jsonb not null,
 result jsonb,
 created_at timestamptz not null default now(),
 primary key(turn_id,call_id),
 foreign key(turn_id,username) references public.planner_subscription_tool_turns(id,username) on delete cascade
);
create index planner_subscription_tool_call_owner on public.planner_subscription_tool_calls(username,turn_id);
alter table public.planner_subscription_tool_turns enable row level security;
alter table public.planner_subscription_tool_calls enable row level security;
revoke all on public.planner_subscription_tool_turns,public.planner_subscription_tool_calls from public,anon,authenticated;
grant select,insert,update,delete on public.planner_subscription_tool_turns,public.planner_subscription_tool_calls to service_role;
