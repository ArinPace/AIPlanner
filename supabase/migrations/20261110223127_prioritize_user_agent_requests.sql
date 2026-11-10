create or replace function public.planner_vm_chat_control(p_username text,p_chat uuid,p_action text,p_job uuid default null,p_message text default '',p_attachments jsonb default '[]',p_payload jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path=public as $$
declare c planner_vm_chats; j planner_vm_jobs; h uuid; n planner_vm_jobs; context text='';
begin
 -- Serialize new requests with the worker's claim decision.
 if p_action in ('send','queue') then
  select id into h from planner_vm_hosts where username=p_username and revoked_at is null for update;
  if h is null then raise exception 'Pair your private computer first'; end if;
 end if;
 select * into c from planner_vm_chats where id=p_chat and username=p_username and deleted_at is null for update;
 if c.id is null or c.archived then raise exception 'Chat unavailable or archived'; end if;
 select * into j from planner_vm_jobs where username=p_username and chat_id=c.id and status in ('queued','running','paused') for update;
 if p_action in ('pause','resume') then
  if j.id is null or j.id is distinct from p_job then raise exception 'This task already finished or changed'; end if;
  if p_action='pause' then
   update planner_vm_jobs set status='paused',lease=null,lease_until=null where id=j.id returning * into n;
  elsif j.status='paused' then
   update planner_vm_jobs set status='queued',lease=null,lease_until=null,finished_at=null,error=null,continuation=true where id=j.id returning * into n;
  else n=j;
  end if;
 elsif p_action in ('send','queue') then
  if length(trim(p_message))=0 or length(p_message)>12000 then raise exception 'Message required'; end if;
  if j.id is not null and p_action='send' then
   if j.kind not in ('chat','sync') then raise exception 'This task cannot be steered'; end if;
   context=left(j.continuation_context||E'\nPrevious user request: '||j.message||E'\nSaved assistant progress: '||j.reply,100000);
   update planner_vm_jobs set status='cancelled',finished_at=now(),lease=null,lease_until=null,result=result||'{"steered":true}'::jsonb where id=j.id;
  end if;
  insert into planner_vm_jobs(username,chat_id,host_id,kind,message,thread_id,attachments,attachment_payload,continuation_context,fork_thread_id,fork_turn_id,branch_history,status,created_at)
   values(p_username,c.id,h,'chat',p_message,coalesce(j.thread_id,c.thread_id),p_attachments,p_payload,context,case when c.thread_id is null then c.fork_thread_id end,case when c.thread_id is null then c.fork_turn_id end,case when c.thread_id is null then c.branch_history else '[]'::jsonb end,case when (p_action='queue' and (j.id is not null or exists(select 1 from planner_vm_jobs where chat_id=c.id and status='waiting' and kind='chat'))) or (p_action='send' and j.id is null and exists(select 1 from planner_vm_jobs where chat_id=c.id and status='waiting' and kind='chat')) then 'waiting' else 'queued' end,clock_timestamp()) returning * into n;
 else raise exception 'Unknown chat control';
 end if;
 update planner_vm_chats set updated_at=now() where id=c.id;
 return jsonb_build_object('id',n.id,'status',n.status,'steered',p_action='send' and j.id is not null);
end $$;
revoke all on function public.planner_vm_chat_control(text,uuid,text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.planner_vm_chat_control(text,uuid,text,uuid,text,jsonb,jsonb) to service_role;



create or replace function public.planner_vm_claim(p_host uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_job planner_vm_jobs; v_user text;
begin
 select username into v_user from planner_vm_hosts where id=p_host and revoked_at is null for update;
 if v_user is null then return null; end if;
 -- Expired jobs fail visibly. Never silently replay a possibly completed write.
 update planner_vm_jobs set status='failed',error='Worker disconnected. Check the planner before retrying.',finished_at=now()
 where host_id=p_host and status='running' and lease_until<now();
 if exists(select 1 from planner_vm_jobs where host_id=p_host and status='running') then return null; end if;
 -- A due review waits without occupying the chat's one active slot.
 update planner_vm_jobs set status='waiting'
 where host_id=p_host and username=v_user and kind='sync' and schedule_slot is not null and status='queued';
 select j.* into v_job from planner_vm_jobs j where j.host_id=p_host and j.username=v_user
 and (j.status='queued' or (j.status='waiting' and not exists(select 1 from planner_vm_jobs a where a.chat_id=j.chat_id and a.status in ('queued','running','paused'))))
 and (j.chat_id is null or exists(select 1 from planner_vm_chats c where c.id=j.chat_id and c.username=v_user and not c.archived and c.deleted_at is null))
 and (j.kind <> 'sync' or j.schedule_slot is null or not exists(
  select 1 from planner_vm_jobs manual
  join planner_vm_chats chat on chat.id=manual.chat_id and chat.username=v_user
  where manual.username=v_user and manual.host_id=p_host and manual.kind='chat'
    and manual.status in ('queued','waiting','running','paused')
    and not chat.archived and chat.deleted_at is null
 ))
 order by (j.kind='sync' and j.schedule_slot is not null),j.created_at,j.id for update of j skip locked limit 1;
 if v_job.id is null then return null; end if;
 update planner_vm_jobs set status='running',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',started_at=now(),
 created_at=case when v_job.kind='sync' and v_job.schedule_slot is not null and v_job.started_at is null then clock_timestamp() else created_at end,
 thread_id=case when v_job.status='waiting' then (select thread_id from planner_vm_chats where id=v_job.chat_id) else thread_id end,
 fork_thread_id=case when v_job.status='waiting' and exists(select 1 from planner_vm_chats where id=v_job.chat_id and thread_id is not null) then null else fork_thread_id end,
 fork_turn_id=case when v_job.status='waiting' and exists(select 1 from planner_vm_chats where id=v_job.chat_id and thread_id is not null) then null else fork_turn_id end,
 branch_history=case when v_job.status='waiting' and exists(select 1 from planner_vm_chats where id=v_job.chat_id and thread_id is not null) then '[]'::jsonb else branch_history end
 where id=v_job.id returning * into v_job;
 if v_job.kind='sync' and v_job.schedule_slot ~ '^\d{4}-\d{2}-\d{2} \d{2}(:\d{2})?$' then
  perform public.planner_arm_whoop_review(v_user,'agent',v_job.schedule_slot);
 end if;
 return to_jsonb(v_job);
end $$;

revoke all on function public.planner_vm_claim(uuid) from public,anon,authenticated;
grant execute on function public.planner_vm_claim(uuid) to service_role;

create or replace function public.planner_queue_subject_rollover(p_username text,p_host uuid,p_message text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare schedule planner_subject_rollovers; chat uuid; thread uuid; job uuid;
begin
 if not exists(select 1 from planner_vm_hosts where id=p_host and username=p_username and revoked_at is null) then raise exception 'Host unavailable'; end if;
 select * into schedule from planner_subject_rollovers where username=p_username for update;
 if not found or schedule.next_at is null or schedule.next_at>now() or schedule.last_queued_at>=schedule.next_at then return null; end if;
 chat=planner_ensure_main_chat(p_username);
 if exists(select 1 from planner_vm_jobs where username=p_username and chat_id=chat and status in ('queued','running','paused','waiting')) then return null; end if;
 select thread_id into thread from planner_vm_chats where id=chat and username=p_username;
 insert into planner_vm_jobs(username,host_id,chat_id,thread_id,kind,message,schedule_slot,status)
 values(p_username,p_host,chat,thread,'sync',p_message,'subject-turnover:'||schedule.next_at::text,'waiting')
 on conflict(username,schedule_slot) do nothing returning id into job;
 if job is not null then update planner_subject_rollovers set last_queued_at=schedule.next_at,last_job_id=job,updated_at=now() where username=p_username; end if;
 return job;
end $$;
revoke all on function public.planner_queue_subject_rollover(text,uuid,text) from public,anon,authenticated;
grant execute on function public.planner_queue_subject_rollover(text,uuid,text) to service_role;
create or replace function public.planner_queue_whoop_review(p_username text,p_host uuid,p_message text)
returns boolean language plpgsql security definer set search_path=public as $$
declare r planner_whoop_reviews; c planner_vm_chats; j uuid;
begin
 if not exists(select 1 from planner_vm_hosts where id=p_host and username=p_username and revoked_at is null) or not exists(select 1 from planner_vm_settings where username=p_username and schedule_enabled and 'whoop'=any(sources)) then return false; end if;
 select * into r from planner_whoop_reviews where username=p_username and channel='agent' and next_at<=now() for update skip locked;
 if not found then return false; end if;
 select * into c from planner_vm_chats where username=p_username and is_main and deleted_at is null and not archived;
 if not found or exists(select 1 from planner_vm_jobs where username=p_username and chat_id=c.id and status in ('queued','running','waiting','paused')) then return false; end if;
 insert into planner_vm_jobs(username,host_id,chat_id,thread_id,kind,schedule_slot,message,status)
 values(p_username,p_host,c.id,c.thread_id,'sync','whoop:'||r.next_at::text,p_message,'waiting')
 on conflict(username,schedule_slot) do nothing returning id into j;
 if j is null then return false; end if;
 update planner_whoop_reviews set next_at=now()+interval '1 hour',updated_at=clock_timestamp() where username=p_username and channel='agent';
 return true;
end $$;
