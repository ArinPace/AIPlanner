create table public.planner_planning (
 username text primary key,
 state jsonb not null default '{}'::jsonb,
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.planner_planning enable row level security;
revoke all on public.planner_planning from public, anon, authenticated;
grant all on public.planner_planning to service_role;

alter table public.planner_vm_chats add column is_main boolean not null default false;
create unique index planner_one_main_chat on public.planner_vm_chats(username) where is_main;
create function public.planner_protect_main_chat() returns trigger language plpgsql set search_path=public as $$
begin
 if old.is_main and (tg_op='DELETE' or not new.is_main or new.title<>'Main Chat' or new.archived or new.deleted_at is not null or new.username<>old.username) then
  raise exception 'Main Chat cannot be renamed, archived or deleted. Use Reset Main Chat to clear its conversation.';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.planner_protect_main_chat() from public,anon,authenticated;
create trigger planner_main_chat_protection before update or delete on public.planner_vm_chats for each row execute function public.planner_protect_main_chat();
insert into public.planner_vm_chats(username,title,is_main) select username,'Main Chat',true from public.planner_calendars on conflict (username) where is_main do nothing;

create function public.planner_ensure_main_chat(p_username text) returns uuid language plpgsql set search_path=public as $$
declare result uuid;
begin
 insert into planner_vm_chats(username,title,is_main) values(p_username,'Main Chat',true) on conflict (username) where is_main do nothing;
 select id into result from planner_vm_chats where username=p_username and is_main;
 return result;
end $$;

create function public.planner_reset_main_chat(p_username text) returns void language plpgsql set search_path=public as $$
declare c uuid;
begin
 select id into c from planner_vm_chats where username=p_username and is_main for update;
 if c is null then raise exception 'Main Chat not found'; end if;
 if exists(select 1 from planner_vm_jobs where username=p_username and chat_id=c and status in ('queued','running','waiting','paused')) then raise exception 'Stop all Main Chat tasks before resetting it.'; end if;
 delete from planner_vm_jobs where username=p_username and chat_id=c;
 update planner_vm_chats set thread_id=null,branch_history='[]'::jsonb,fork_thread_id=null,fork_turn_id=null,parent_chat_id=null,parent_job_id=null,updated_at=now() where id=c and username=p_username;
 delete from planner_planning where username=p_username;
end $$;

create function public.planner_commit_day_plan(p_username text,p_revision bigint,p_calendar_revision bigint,p_calendar jsonb) returns void language plpgsql set search_path=public as $$
begin
 perform 1 from planner_planning where username=p_username and revision=p_revision for update;
 if not found then raise exception 'Planning preferences changed. Read them again.'; end if;
 update planner_calendars set state=p_calendar,revision=revision+1,updated_at=now() where username=p_username and revision=p_calendar_revision;
 if not found then raise exception 'Calendar changed. Read it again before replanning.'; end if;
end $$;
revoke all on function public.planner_ensure_main_chat(text),public.planner_reset_main_chat(text),public.planner_commit_day_plan(text,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.planner_ensure_main_chat(text),public.planner_reset_main_chat(text),public.planner_commit_day_plan(text,bigint,bigint,jsonb) to service_role;
