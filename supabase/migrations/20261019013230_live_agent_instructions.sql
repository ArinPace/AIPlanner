create table public.planner_agent_instructions (
 username text primary key references public.planner_calendars(username) on delete cascade,
 content text not null default '' check(char_length(content)<=20000),
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.planner_agent_instructions enable row level security;
revoke all on public.planner_agent_instructions from public,anon,authenticated;
grant select,insert,update,delete on public.planner_agent_instructions to service_role;
create function public.planner_save_agent_instructions(p_username text,p_revision bigint,p_content text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved planner_agent_instructions;
begin
 if p_revision is null or p_revision<0 or p_content is null then raise exception 'Invalid instructions update'; end if;
 insert into planner_agent_instructions(username) values(p_username) on conflict(username) do nothing;
 update planner_agent_instructions set content=p_content,revision=revision+1,updated_at=now()
 where username=p_username and revision=p_revision returning * into saved;
 if not found then raise exception 'Instructions changed. Read the latest version and merge before saving.'; end if;
 return jsonb_build_object('content',saved.content,'revision',saved.revision,'updatedAt',saved.updated_at,'saved',true,'applies','next run, including resumed chats and scheduled reviews');
end $$;
revoke all on function public.planner_save_agent_instructions(text,bigint,text) from public,anon,authenticated;
grant execute on function public.planner_save_agent_instructions(text,bigint,text) to service_role;
