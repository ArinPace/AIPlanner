create table public.planner_subscription_files (
 id uuid primary key,username text not null references public.planner_accounts(username) on delete cascade,
 chat_id uuid not null,name text not null,mime text not null,size bigint not null check(size>0 and size<=26214400),
 storage_path text not null unique,status text not null check(status in ('pending','complete')),created_at timestamptz not null default now(),
 foreign key(chat_id,username) references public.planner_subscription_chats(id,username) on delete cascade
);
alter table public.planner_subscription_files enable row level security;
revoke all on public.planner_subscription_files from public,anon,authenticated;
grant select,insert,update,delete on public.planner_subscription_files to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('planner-chat-files','planner-chat-files',false,26214400);
