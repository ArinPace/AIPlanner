create table public.planner_files_read_cache (
 username text not null references public.planner_files(username) on delete cascade,
 kind text not null check(kind in ('metadata','todo')),
 revision bigint not null,
 value jsonb,
 primary key(username,kind)
);
alter table public.planner_files_read_cache enable row level security;
revoke all on public.planner_files_read_cache from public,anon,authenticated;
grant select,insert,update,delete on public.planner_files_read_cache to service_role;
alter function public.planner_files_metadata(text) rename to planner_files_metadata_compute;

create function public.planner_files_cached_read(p_username text,p_kind text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare rev bigint; cached jsonb; computed jsonb;
begin
 if p_kind not in ('metadata','todo') then raise exception 'Invalid read kind'; end if;
 select revision into rev from public.planner_files where username=p_username;
 if not found then return null; end if;
 select value into cached from public.planner_files_read_cache where username=p_username and kind=p_kind and revision=rev;
 if found then return cached; end if;
 computed=case p_kind when 'metadata' then public.planner_files_metadata_compute(p_username) else public.planner_canonical_note(p_username,'todo') end;
 rev=coalesce((computed->>'revision')::bigint,rev);
 insert into public.planner_files_read_cache(username,kind,revision,value) values(p_username,p_kind,rev,computed)
 on conflict(username,kind) do update set revision=excluded.revision,value=excluded.value
 where public.planner_files_read_cache.revision<=excluded.revision;
 return computed;
end $$;
revoke all on function public.planner_files_cached_read(text,text) from public,anon,authenticated;
grant execute on function public.planner_files_cached_read(text,text) to service_role;
create function public.planner_files_metadata(p_username text) returns jsonb
language sql volatile set search_path='' as $$ select public.planner_files_cached_read(p_username,'metadata') $$;
create function public.planner_planning_todo(p_username text) returns jsonb
language sql volatile set search_path='' as $$ select public.planner_files_cached_read(p_username,'todo') $$;
revoke all on function public.planner_files_metadata(text),public.planner_planning_todo(text) from public,anon,authenticated;
grant execute on function public.planner_files_metadata(text),public.planner_planning_todo(text) to service_role;
