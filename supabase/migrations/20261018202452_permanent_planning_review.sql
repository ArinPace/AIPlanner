drop function public.planner_start_calendar(text,bigint);
create function public.planner_start_calendar(p_username text,p_revision bigint,p_message text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c uuid; p planner_planning; j planner_vm_jobs; job jsonb; was_started boolean;
begin
 select id into c from planner_vm_chats where username=p_username and is_main for update;
 if c is null then raise exception 'Open Main Chat before planning your calendar.'; end if;
 select * into p from planner_planning where username=p_username for update;
 if p.username is null then raise exception 'Read planning settings before starting.'; end if;
 select * into j from planner_vm_jobs where id=p.start_job_id and username=p_username and chat_id=c and status in ('queued','running','waiting','paused');
 if j.id is not null then return jsonb_build_object('startedAt',p.started_at,'jobId',j.id,'alreadyRunning',true,'status',j.status); end if;
 if p.revision is distinct from p_revision then raise exception 'Planning changed. Refresh and try again.'; end if;
 if p_message is null or length(trim(p_message))=0 or length(p_message)>12000 then raise exception 'Invalid calendar review request'; end if;
 was_started=p.started_at is not null;
 job=planner_vm_chat_control(p_username,c,'queue',null,p_message);
 update planner_planning set started_at=coalesce(started_at,now()),start_job_id=(job->>'id')::uuid,state=state||'{"enabled":true}'::jsonb,revision=revision+1,updated_at=now() where username=p_username returning * into p;
 return jsonb_build_object('startedAt',p.started_at,'jobId',p.start_job_id,'alreadyStarted',was_started,'alreadyRunning',false,'status',job->>'status');
end $$;
revoke all on function public.planner_start_calendar(text,bigint,text) from public,anon,authenticated;
grant execute on function public.planner_start_calendar(text,bigint,text) to service_role;
