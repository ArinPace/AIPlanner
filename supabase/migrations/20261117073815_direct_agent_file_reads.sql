-- One SQL snapshot returns only the requested item and its matching revision.
-- Agent reads must not hash/serialize every other note just to locate one ID.
create or replace function public.planner_read_file_item(p_username text,p_id text)
returns jsonb language sql stable security invoker set search_path=public
as $$
 select jsonb_build_object('revision',f.revision,'section',hit.section,'item',hit.item)
 from public.planner_files f
 cross join lateral (
  select 'files'::text as section,value as item,0 as priority
  from jsonb_array_elements(coalesce(f.state->'files','[]'::jsonb))
  where value->>'id'=p_id
  union all
  select 'documents'::text,value,1
  from jsonb_array_elements(coalesce(f.state->'documents','[]'::jsonb))
  where value->>'id'=p_id
 ) hit
 where f.username=p_username
 order by hit.priority limit 1
$$;
revoke all on function public.planner_read_file_item(text,text) from public,anon,authenticated;
grant execute on function public.planner_read_file_item(text,text) to service_role;
