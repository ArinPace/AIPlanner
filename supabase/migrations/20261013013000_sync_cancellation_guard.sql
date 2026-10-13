create or replace function public.planner_apply_sync(
  p_username text, p_run uuid, p_calendar_revision bigint, p_files_revision bigint,
  p_calendar jsonb, p_files jsonb, p_summary text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform 1 from planner_agent_runs where id=p_run and username=p_username and applied_at is null and status in ('running','applying') for update;
  if not found then return false; end if;
  perform 1 from planner_calendars where username=p_username and revision=p_calendar_revision for update;
  if not found then raise exception 'concurrent calendar edit' using errcode='40001'; end if;
  perform 1 from planner_files where username=p_username and revision=p_files_revision for update;
  if not found then raise exception 'concurrent files edit' using errcode='40001'; end if;
  update planner_calendars set state=p_calendar,revision=revision+1,updated_at=now() where username=p_username;
  update planner_files set state=p_files,revision=revision+1,updated_at=now() where username=p_username;
  update planner_agent_runs set status='succeeded',summary=p_summary,applied_at=now(),finished_at=now() where id=p_run and username=p_username;
  return true;
end $$;
revoke all on function public.planner_apply_sync(text,uuid,bigint,bigint,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.planner_apply_sync(text,uuid,bigint,bigint,jsonb,jsonb,text) to service_role;
