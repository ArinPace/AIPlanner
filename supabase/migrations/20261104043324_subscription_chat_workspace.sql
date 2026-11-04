create table public.planner_subscription_chats (
 id uuid primary key default gen_random_uuid(),
 username text not null references public.planner_accounts(username) on delete cascade,
 title text not null default 'New chat' check(length(title) between 1 and 120),
 is_main boolean not null default false,pinned boolean not null default false,archived boolean not null default false,
 deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,username),
 check(not is_main or (title='Main Chat' and pinned and not archived and deleted_at is null))
);
create unique index planner_subscription_main on public.planner_subscription_chats(username) where is_main;
create index planner_subscription_chat_owner on public.planner_subscription_chats(username,updated_at desc);
create table public.planner_subscription_messages (
 id uuid primary key default gen_random_uuid(),username text not null,
 chat_id uuid not null,role text not null check(role in ('user','assistant')),
 content text not null check(length(content)<=80000),created_at timestamptz not null default now(),
 foreign key(chat_id,username) references public.planner_subscription_chats(id,username) on delete cascade
);
create index planner_subscription_message_history on public.planner_subscription_messages(username,chat_id,created_at desc,id desc);
alter table public.planner_subscription_chats enable row level security;
alter table public.planner_subscription_messages enable row level security;
revoke all on public.planner_subscription_chats,public.planner_subscription_messages from public,anon,authenticated;
grant select,insert,update,delete on public.planner_subscription_chats,public.planner_subscription_messages to service_role;
