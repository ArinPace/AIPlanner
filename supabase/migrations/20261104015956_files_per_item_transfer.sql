-- Return a compact index without transferring the complete note corpus to Vercel.
create or replace function public.planner_files_manifest(p_username text)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
 with workspace as (
  select revision, state from public.planner_files where username = p_username
 ), entries as (
  select section, item, ordinal - 1 as item_index
  from workspace,
       unnest(array['folders','files','documents']) as sections(section),
       jsonb_array_elements(coalesce(state -> section, '[]'::jsonb)) with ordinality as elements(item, ordinal)
 ), numbered as (
  select *, sum(case when section <> 'files' then 1 else 0 end) over (order by section, item_index) as metadata_index from entries
 )
 select jsonb_build_object('revision', workspace.revision, 'items', coalesce((
  select jsonb_agg(jsonb_build_object('section',section,'id',item->>'id','index',item_index,'etag',md5(item::text)) ||
   case when section <> 'files' and metadata_index <= 256 and octet_length(item::text) < 2048
        then jsonb_build_object('value',item) else '{}'::jsonb end order by section,item_index)
  from numbered
 ), '[]'::jsonb)) from workspace;
$$;
revoke all on function public.planner_files_manifest(text) from public, anon, authenticated;
grant execute on function public.planner_files_manifest(text) to service_role;
