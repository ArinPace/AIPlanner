-- Keep one-note writes small across PostgREST instead of resending the entire
-- Files JSON corpus. Server-side validation and existing protection/history
-- triggers remain active; this service-only function never bypasses RLS.
create or replace function public.planner_save_file_item(p_username text,p_revision bigint,p_item jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare workspace public.planner_files%rowtype; item_index integer; next_state jsonb;
begin
 if jsonb_typeof(p_item) is distinct from 'object' or coalesce(p_item->>'id','')='' then raise exception 'Invalid file item' using errcode='23514'; end if;
 select * into workspace from public.planner_files where username=p_username for update;
 if not found or workspace.revision<>p_revision then raise exception 'Files changed. Read the latest revision.' using errcode='P0001'; end if;
 select (ordinality-1)::integer into item_index from jsonb_array_elements(coalesce(workspace.state->'files','[]'::jsonb)) with ordinality f(value,ordinality) where value->>'id'=p_item->>'id';
 if item_index is null then
  next_state=jsonb_set(workspace.state,'{files}',coalesce(workspace.state->'files','[]'::jsonb)||jsonb_build_array(p_item));
 else
  next_state=jsonb_set(workspace.state,array['files',item_index::text],p_item);
 end if;
 update public.planner_files set state=next_state,revision=revision+1,updated_at=now() where username=p_username;
 return jsonb_build_object('revision',p_revision+1);
end;
$$;
revoke all on function public.planner_save_file_item(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.planner_save_file_item(text,bigint,jsonb) to service_role;
