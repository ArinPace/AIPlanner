-- Agent discovery needs metadata, not every note body in the workspace.
create or replace function public.planner_files_metadata(p_username text) returns jsonb
language plpgsql stable set search_path='' as $$
declare w public.planner_files; items jsonb; item jsonb; summaries jsonb='[]'; i integer;
begin
 select * into w from public.planner_files where username=p_username;
 if not found then return null; end if;
 items=coalesce(w.state->'files','[]'::jsonb);
 for i in 0..jsonb_array_length(items)-1 loop
  item=items->i;
  summaries=summaries||jsonb_build_array(jsonb_build_object('id',item->'id','folderId',item->'folderId','name',item->'name','format',coalesce(item->>'format','text'),'pinned',coalesce((item->>'pinned')::boolean,false),'tags',coalesce(item->'tags','[]'::jsonb),'updatedAt',item->'updatedAt'));
 end loop;
 return jsonb_build_object('revision',w.revision,'folders',coalesce(w.state->'folders','[]'::jsonb),'files',summaries,'documents',coalesce(w.state->'documents','[]'::jsonb));
end $$;
revoke all on function public.planner_files_metadata(text) from public,anon,authenticated;
grant execute on function public.planner_files_metadata(text) to service_role;

-- This tiny status field is polled frequently. Keep it outside the multi-MB
-- calendar snapshot so status checks do not decompress the entire draft.
alter table public.planner_calendar_staging add column if not exists google_decisions jsonb not null default '{}';
update public.planner_calendar_staging set google_decisions=coalesce(payload->'googleDecisions','{}'::jsonb) where google_decisions is distinct from coalesce(payload->'googleDecisions','{}'::jsonb);
create or replace function public.planner_stage_decisions_metadata() returns trigger
language plpgsql set search_path='' as $$
begin
 new.google_decisions=coalesce(new.payload->'googleDecisions','{}'::jsonb);
 return new;
end $$;
revoke all on function public.planner_stage_decisions_metadata() from public,anon,authenticated;
create trigger planner_stage_decisions_metadata before insert or update of payload on public.planner_calendar_staging for each row execute function public.planner_stage_decisions_metadata();

-- Return only the ID, and keep large JSON processing within a bounded RPC.
create or replace function public.planner_prepare_calendar_stage(p_username text,p_stage jsonb) returns jsonb
language plpgsql set search_path='' set work_mem='16MB' as $$
declare v_id uuid=(p_stage->>'id')::uuid; saved uuid;
begin
 if p_stage->>'username' is distinct from p_username or p_stage->>'status' is distinct from 'draft' or (p_stage->>'version')::bigint<>1 then raise exception 'Invalid calendar draft'; end if;
 insert into public.planner_calendar_staging(id,username,version,base_revision,account_id,status,approved_revision,payload)
 values(v_id,p_username,1,(p_stage->>'base_revision')::bigint,(p_stage->>'account_id')::uuid,'draft',null,p_stage->'payload')
 on conflict(id) do nothing returning id into saved;
 if saved is null and not exists(select 1 from public.planner_calendar_staging where id=v_id and username=p_username and version=1 and status='draft' and payload=p_stage->'payload' and base_revision=(p_stage->>'base_revision')::bigint and account_id is not distinct from (p_stage->>'account_id')::uuid) then raise exception 'Calendar draft changed' using errcode='P0001'; end if;
 return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.planner_prepare_calendar_stage(text,jsonb) from public,anon,authenticated;
grant execute on function public.planner_prepare_calendar_stage(text,jsonb) to service_role;
