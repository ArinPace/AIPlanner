-- Read the two small canonical notes once, rather than three parallel Files reads.
create or replace function public.planner_event_check_context(p_username text) returns jsonb
language plpgsql security invoker set search_path='' set statement_timeout='45s' as $$
declare c public.planner_calendars; p public.planner_planning; file_items jsonb; rev bigint; n jsonb; todo jsonb; work jsonb;
begin
 select * into c from public.planner_calendars where username=p_username;
 select * into p from public.planner_planning where username=p_username;
 select state->'files',revision into file_items,rev from public.planner_files where username=p_username;
 if c.username is null or p.username is null or rev is null then raise exception 'Workspace not found' using errcode='P0002'; end if;
 for n in select value from jsonb_array_elements(file_items) loop
  if n->>'systemRole'='todo' then todo:=n; end if;
  if n->>'systemRole'='work' then work:=n; end if;
  exit when todo is not null and work is not null;
 end loop;
 if todo is null then select value into todo from jsonb_array_elements(file_items) where lower(trim(value->>'name')) in ('to do','to-do','todo') limit 1; end if;
 if work is null then select value into work from jsonb_array_elements(file_items) where value->>'folderId' is null and value->>'name'='Work' limit 1; end if;
 if todo is null and work is null then raise exception 'Canonical note not found' using errcode='P0002'; end if;
 return jsonb_build_object('calendar',jsonb_build_object('state',c.state,'revision',c.revision),'planning',jsonb_build_object('state',p.state,'revision',p.revision),'filesRevision',rev,'notes',(case when todo is null then '[]'::jsonb else jsonb_build_array(todo) end)||(case when work is null then '[]'::jsonb else jsonb_build_array(work) end));
end $$;
revoke all on function public.planner_event_check_context(text) from public,anon,authenticated;
grant execute on function public.planner_event_check_context(text) to service_role;
notify pgrst,'reload schema';
