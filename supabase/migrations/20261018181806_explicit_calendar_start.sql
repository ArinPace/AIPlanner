alter table public.planner_planning add column started_at timestamptz, add column start_job_id uuid references public.planner_vm_jobs(id) on delete set null;
create function public.planner_start_calendar(p_username text,p_revision bigint) returns jsonb language plpgsql set search_path=public as $$
declare c uuid; p planner_planning; job jsonb;
begin
 select id into c from planner_vm_chats where username=p_username and is_main for update;
 if c is null then raise exception 'Open Main Chat before starting your calendar.'; end if;
 select * into p from planner_planning where username=p_username for update;
 if p.started_at is not null then return jsonb_build_object('startedAt',p.started_at,'jobId',p.start_job_id,'alreadyStarted',true); end if;
 if p.revision is distinct from p_revision then raise exception 'Setup changed. Review the latest settings before starting.'; end if;
 if coalesce((p.state->>'onboarded')::boolean,false) is not true then raise exception 'Finish discussing Goals, To do, your routine and task estimates in Main Chat first.'; end if;
 job=planner_vm_chat_control(p_username,c,'queue',null,'I clicked Start planning my calendar. Begin populating my calendar using the confirmed setup. Read planner_planning_read and the permanent Goals and To do notes, reuse existing task IDs, register the agreed work with source references and realistic confirmed estimates, then planner_replan the next seven days. Preserve fixed commitments and daily sleep, getting-ready, meals and wind-down anchors. If important details are still missing, ask instead of guessing. Explain what was scheduled and any conflicts.');
 update planner_planning set started_at=now(),start_job_id=(job->>'id')::uuid,state=state||'{"enabled":true}'::jsonb,revision=revision+1,updated_at=now() where username=p_username returning * into p;
 return jsonb_build_object('startedAt',p.started_at,'jobId',p.start_job_id,'alreadyStarted',false);
end $$;
revoke all on function public.planner_start_calendar(text,bigint) from public,anon,authenticated;
grant execute on function public.planner_start_calendar(text,bigint) to service_role;
create or replace function public.planner_commit_day_plan(p_username text,p_revision bigint,p_calendar_revision bigint,p_calendar jsonb) returns void language plpgsql set search_path=public as $$
begin
 perform 1 from planner_planning where username=p_username and revision=p_revision and started_at is not null for update;
 if not found then raise exception 'Click Start planning my calendar in Main Chat first, or read the latest planning preferences.'; end if;
 update planner_calendars set state=p_calendar,revision=revision+1,updated_at=now() where username=p_username and revision=p_calendar_revision;
 if not found then raise exception 'Calendar changed. Read it again before replanning.'; end if;
end $$;
