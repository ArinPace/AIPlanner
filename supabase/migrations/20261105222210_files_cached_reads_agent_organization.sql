create or replace function public.planner_files_manifest(p_username text) returns jsonb language sql stable set search_path='' as $$
 with workspace as (select revision,state from public.planner_files where username=p_username),
 entries as (select section,item,ordinal-1 item_index from workspace,unnest(array['folders','files','documents']) sections(section),jsonb_array_elements(coalesce(state->section,'[]'::jsonb)) with ordinality elements(item,ordinal)),
 numbered as (select *,sum(case when section<>'files' then 1 else 0 end) over(order by section,item_index) metadata_index from entries)
 select jsonb_build_object('revision',workspace.revision,'items',coalesce((select jsonb_agg(jsonb_build_object('section',section,'id',item->>'id','index',item_index,'etag',md5(item::text),'bytes',octet_length(item::text)) || case when section<>'files' and metadata_index<=256 and octet_length(item::text)<2048 then jsonb_build_object('value',item) else '{}'::jsonb end order by section,item_index) from numbered),'[]'::jsonb)) from workspace;
$$;
create function public.planner_files_batch(p_username text,p_revision bigint,p_ids text[]) returns jsonb language plpgsql stable set search_path='' as $$
declare w public.planner_files%rowtype; items jsonb;
begin
 if cardinality(p_ids)<1 or cardinality(p_ids)>40 then raise exception 'Invalid batch' using errcode='23514'; end if;
 select * into w from public.planner_files where username=p_username;
 if not found or w.revision<>p_revision then raise exception 'Files changed while loading. Please retry.' using errcode='P0001'; end if;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into items from unnest(array['folders','files','documents']) section,jsonb_array_elements(coalesce(w.state->section,'[]'::jsonb)) item where item->>'id'=any(p_ids);
 if jsonb_array_length(items)<>cardinality(p_ids) then raise exception 'Files changed while loading. Please retry.' using errcode='P0001'; end if;
 if octet_length(items::text)>3500000 then raise exception 'Read fewer items per batch' using errcode='23514'; end if;
 return jsonb_build_object('revision',w.revision,'items',items);
end $$;
revoke all on function public.planner_files_batch(text,bigint,text[]) from public,anon,authenticated;
grant execute on function public.planner_files_batch(text,bigint,text[]) to service_role;
