create table public.planner_agent_memory (
 username text primary key references public.planner_calendars(username) on delete cascade,
 content text not null default '' check (char_length(content)<=200000),
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.planner_agent_memory enable row level security;
revoke all on public.planner_agent_memory from public,anon,authenticated;
grant all on public.planner_agent_memory to service_role;
insert into public.planner_agent_memory(username) select username from public.planner_calendars;
create function public.planner_save_agent_memory(p_username text,p_revision bigint,p_content text,p_append boolean default false) returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved planner_agent_memory;
begin
 if p_revision is null or p_revision<0 or p_content is null then raise exception 'Invalid memory update'; end if;
 insert into planner_agent_memory(username) values(p_username) on conflict(username) do nothing;
 update planner_agent_memory set content=case when p_append then content||case when content='' then '' else E'\n' end||p_content else p_content end,revision=revision+1,updated_at=now()
 where username=p_username and revision=p_revision returning * into saved;
 if not found then raise exception 'Memory changed. Read the latest document and merge your changes.'; end if;
 return jsonb_build_object('saved',true,'revision',saved.revision,'totalCharacters',char_length(saved.content),'updatedAt',saved.updated_at);
end $$;
revoke all on function public.planner_save_agent_memory(text,bigint,text,boolean) from public,anon,authenticated;
grant execute on function public.planner_save_agent_memory(text,bigint,text,boolean) to service_role;

create or replace function public.planner_reset_main_chat(p_username text) returns void language plpgsql set search_path=public as $$
declare c uuid;
begin
 select id into c from planner_vm_chats where username=p_username and is_main for update;
 if c is null then raise exception 'Main Chat not found'; end if;
 if exists(select 1 from planner_vm_jobs where username=p_username and chat_id=c and status in ('queued','running','waiting','paused')) then raise exception 'Stop all Main Chat tasks before resetting it.'; end if;
 delete from planner_vm_jobs where username=p_username and chat_id=c;
 update planner_vm_chats set thread_id=null,branch_history='[]'::jsonb,fork_thread_id=null,fork_turn_id=null,parent_chat_id=null,parent_job_id=null,updated_at=now() where id=c and username=p_username;
 delete from planner_planning where username=p_username;
 delete from planner_agent_memory where username=p_username;
end $$;
