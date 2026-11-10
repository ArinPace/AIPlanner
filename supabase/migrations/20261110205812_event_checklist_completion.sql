-- Server-only, revision-checked atomic completion/link changes. No public proxy.
create function public.planner_commit_event_checks(
 p_username text,p_calendar_revision bigint,p_files_revision bigint,p_planning_revision bigint,
 p_calendar jsonb,p_notes jsonb,p_planning jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.planner_calendars; f public.planner_files; p public.planner_planning; next_files jsonb;
begin
 select * into c from public.planner_calendars where username=p_username for update;
 select * into f from public.planner_files where username=p_username for update;
 select * into p from public.planner_planning where username=p_username for update;
 if c.username is null or f.username is null or p.username is null or c.revision<>p_calendar_revision or f.revision<>p_files_revision or p.revision<>p_planning_revision then
  raise exception 'Workspace changed' using errcode='P0001';
 end if;
 if jsonb_typeof(p_notes)<>'array' or jsonb_array_length(p_notes)>2 then raise exception 'Invalid note updates'; end if;
 if exists(select 1 from jsonb_array_elements(p_notes) n where not exists(select 1 from jsonb_array_elements(f.state->'files') old where old->>'id'=n->>'id')) then raise exception 'Note not found'; end if;
 select coalesce(jsonb_agg(coalesce((select n from jsonb_array_elements(p_notes) n where n->>'id'=old->>'id'),old) order by ord),'[]'::jsonb)
 into next_files from jsonb_array_elements(f.state->'files') with ordinality items(old,ord);
 if c.state is distinct from p_calendar then update public.planner_calendars set state=p_calendar,revision=revision+1,updated_at=now() where username=p_username returning * into c; end if;
 if f.state->'files' is distinct from next_files then update public.planner_files set state=jsonb_set(state,'{files}',next_files),revision=revision+1,updated_at=now() where username=p_username returning * into f; end if;
 if p.state is distinct from p_planning then update public.planner_planning set state=p_planning,revision=revision+1,updated_at=now() where username=p_username; end if;
 return jsonb_build_object('calendarRevision',c.revision,'filesRevision',f.revision);
end $$;
revoke all on function public.planner_commit_event_checks(text,bigint,bigint,bigint,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.planner_commit_event_checks(text,bigint,bigint,bigint,jsonb,jsonb,jsonb) to service_role;
