create function public.planner_canonical_note(p_username text,p_role text) returns jsonb language sql stable set search_path='' as $$
 with workspace as (select state,revision from public.planner_files where username=p_username),
 note as (select item from workspace,jsonb_array_elements(state->'files') item where
 (p_role='todo' and (item->>'systemRole'='todo' or lower(trim(item->>'name')) in ('to do','to-do','todo')))
 or (p_role='work' and (item->>'systemRole'='work' or (item->>'folderId' is null and item->>'name'='Work')))
 order by (item->>'systemRole'=p_role) desc nulls last limit 1)
 select jsonb_build_object('revision',revision,'partial',true,'folders',coalesce(state->'folders','[]'::jsonb),'files',jsonb_build_array(item),'documents','[]'::jsonb) from workspace,note;
$$;
revoke all on function public.planner_canonical_note(text,text) from public,anon,authenticated;
grant execute on function public.planner_canonical_note(text,text) to service_role;
