alter table public.planner_vm_chats add column if not exists archived boolean not null default false;
