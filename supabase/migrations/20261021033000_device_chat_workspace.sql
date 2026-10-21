create table public.planner_device_chats (
 id uuid primary key default gen_random_uuid(),
 username text not null references public.planner_accounts(username) on delete cascade,
 title text not null default 'New chat' check(length(title) between 1 and 120),
 is_main boolean not null default false,
 pinned boolean not null default false,
 archived boolean not null default false,
 deleted_at timestamptz,
 chatgpt_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,username),
 check(not is_main or (pinned and not archived and deleted_at is null))
);
create unique index planner_device_main_chat on public.planner_device_chats(username) where is_main;
create index planner_device_chat_list on public.planner_device_chats(username,updated_at desc);
alter table public.planner_chat_web_relay add column chat_id uuid;
alter table public.planner_chat_web_relay add constraint planner_device_job_chat foreign key(chat_id,username) references public.planner_device_chats(id,username);
create index planner_device_chat_history on public.planner_chat_web_relay(username,chat_id,created_at desc);
create table public.planner_device_tool_calls (
 job_id uuid not null references public.planner_chat_web_relay(id) on delete cascade,
 call_id text not null check(length(call_id) between 1 and 120),
 username text not null references public.planner_accounts(username) on delete cascade,
 request jsonb not null,
 result jsonb,
 created_at timestamptz not null default now(),
 primary key(job_id,call_id)
);
alter table public.planner_device_chats enable row level security;
alter table public.planner_device_tool_calls enable row level security;
revoke all on public.planner_device_chats,public.planner_device_tool_calls from public,anon,authenticated;
grant select,insert,update,delete on public.planner_device_chats,public.planner_device_tool_calls to service_role;
