-- Small, atomic item changes: do not send the unchanged Notes corpus through
-- PostgREST for folder/link edits and Bin operations. Existing history and
-- permanent-note triggers still execute. Trusted authenticated API only.
create function public.planner_workspace_delta_commit(
 p_username text,p_revision bigint,p_upserts jsonb default '{}'::jsonb,
 p_remove_ids text[] default '{}'::text[],p_bin_add jsonb default null,
 p_bin_remove uuid[] default '{}'::uuid[],p_restore boolean default true
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare w public.planner_files%rowtype; next_state jsonb; section text;
 items jsonb; item jsonb; item_index integer; count_found integer; bin_id uuid; pdfs text[];
begin
 if jsonb_typeof(p_upserts) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_upserts) k where k not in ('files','folders','documents')) then raise exception 'Invalid workspace delta' using errcode='23514'; end if;
 select * into w from public.planner_files where username=p_username for update;
 if not found or w.revision<>p_revision then raise exception 'Files changed. Read the latest revision.' using errcode='P0001'; end if;
 next_state=w.state;
 foreach section in array array['folders','files','documents'] loop
  items=coalesce(next_state->section,'[]'::jsonb);
  if cardinality(p_remove_ids)>0 then
   select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into items from jsonb_array_elements(items) with ordinality a(value,ord) where not (value->>'id'=any(p_remove_ids));
  end if;
  if p_upserts ? section then
   if jsonb_typeof(p_upserts->section) is distinct from 'array' then raise exception 'Invalid item list' using errcode='23514'; end if;
   for item in select value from jsonb_array_elements(p_upserts->section) loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','')='' or item->>'id'=any(p_remove_ids) then raise exception 'Invalid item' using errcode='23514'; end if;
    select (ord-1)::integer into item_index from jsonb_array_elements(items) with ordinality a(value,ord) where value->>'id'=item->>'id';
    if item_index is null then items=items||jsonb_build_array(item); else items=jsonb_set(items,array[item_index::text],item); end if;
   end loop;
  end if;
  if items is distinct from coalesce(next_state->section,'[]'::jsonb) then next_state=jsonb_set(next_state,array[section],items); end if;
 end loop;
 if cardinality(p_bin_remove)>0 then
  perform 1 from public.planner_file_bin where username=p_username and id=any(p_bin_remove) and (not p_restore or expires_at>now()) for update;
  get diagnostics count_found=row_count;
  if count_found<>cardinality(p_bin_remove) then raise exception 'Some Bin items are unavailable or expired.' using errcode='P0001'; end if;
  select array_agg(d->>'id') into pdfs from public.planner_file_bin b,jsonb_array_elements(coalesce(b.snapshot->'documents','[]'::jsonb)) d where b.username=p_username and b.id=any(p_bin_remove) and d->>'kind'='pdf';
  delete from public.planner_file_bin where username=p_username and id=any(p_bin_remove);
 end if;
 if p_bin_add is not null then
  insert into public.planner_file_bin(username,names,snapshot,item_count) values(p_username,p_bin_add->'names',p_bin_add->'snapshot',(p_bin_add->>'itemCount')::integer) returning id into bin_id;
 end if;
 update public.planner_files set state=next_state,revision=revision+1,updated_at=now() where username=p_username;
 if coalesce(cardinality(pdfs),0)>0 then perform public.planner_mark_unused_pdfs(p_username,pdfs); end if;
 return jsonb_build_object('revision',p_revision+1,'binId',bin_id);
end $$;
revoke all on function public.planner_workspace_delta_commit(text,bigint,jsonb,text[],jsonb,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.planner_workspace_delta_commit(text,bigint,jsonb,text[],jsonb,uuid[],boolean) to service_role;
