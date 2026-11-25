begin;
do $test$
declare stage jsonb; result jsonb; source jsonb; rev bigint; stage_id uuid=gen_random_uuid(); fingerprint text;
begin
 select state,revision,md5(state::text) into source,rev,fingerprint from public.planner_files where username='arin';
 if jsonb_array_length(public.planner_files_metadata('arin')->'files')<>jsonb_array_length(source->'files') then raise exception 'Metadata lost files'; end if;
 if exists(select 1 from jsonb_array_elements(public.planner_files_metadata('arin')->'files') x where x ? 'content' or x ? 'rich' or x ? 'agentSnapshot') then raise exception 'Metadata exposed note bodies'; end if;
 if public.planner_planning_todo('arin') is distinct from public.planner_canonical_note('arin','todo') then raise exception 'Todo selection changed'; end if;
 update public.planner_files set revision=revision+1 where username='arin';
 if (public.planner_files_metadata('arin')->>'revision')::bigint<>rev+1 or (public.planner_planning_todo('arin')->>'revision')::bigint<>rev+1 then raise exception 'Cache invalidation failed'; end if;
 if (select md5(state::text) from public.planner_files where username='arin')<>fingerprint then raise exception 'Read changed workspace'; end if;
 select jsonb_build_object('id',stage_id,'username','arin','version',1,'base_revision',revision,'account_id',null,'status','draft','payload',jsonb_build_object('baseCalendar',state,'calendar',state,'google',jsonb_build_object('reviewSkipped',true,'events','[]'::jsonb,'mappings','[]'::jsonb,'timeMin','2026-11-25T00:00:00-05:00','timeMax','2026-11-26T00:00:00-05:00'),'googleDecisions',jsonb_build_object('fixture','preserve_cancelled'),'issues','[]'::jsonb,'resolutions','{}'::jsonb)) into stage from public.planner_calendars where username='arin';
 result=public.planner_prepare_calendar_stage('arin',stage);
 if result is distinct from public.planner_prepare_calendar_stage('arin',stage) then raise exception 'Draft retry is not idempotent'; end if;
 if (select google_decisions->>'fixture' from public.planner_calendar_staging where id=stage_id)<>'preserve_cancelled' then raise exception 'Decision metadata missing'; end if;
 update public.planner_calendar_staging set payload=jsonb_set(payload,'{googleDecisions}','{}'::jsonb) where id=stage_id;
 if (select google_decisions from public.planner_calendar_staging where id=stage_id)<>'{}'::jsonb then raise exception 'Decision metadata stale'; end if;
 begin
  perform public.planner_prepare_calendar_stage('arin',stage);
  raise exception 'Changed draft was overwritten';
 exception when sqlstate 'P0001' then
  if SQLERRM='Changed draft was overwritten' then raise; end if;
 end;
 begin
  perform public.planner_prepare_calendar_stage('arin2',stage);
  raise exception 'Owner mismatch was accepted';
 exception when raise_exception then
  if SQLERRM='Owner mismatch was accepted' then raise; end if;
 end;
 if has_table_privilege('anon','public.planner_files_read_cache','SELECT') or has_function_privilege('authenticated','public.planner_files_metadata(text)','EXECUTE') or has_function_privilege('anon','public.planner_prepare_calendar_stage(text,jsonb)','EXECUTE') then raise exception 'Private read/write privileges exposed'; end if;
end $test$;
rollback;
