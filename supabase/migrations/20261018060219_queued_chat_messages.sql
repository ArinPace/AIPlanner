alter table public.planner_vm_jobs drop constraint planner_vm_jobs_status_check;
alter table public.planner_vm_jobs add constraint planner_vm_jobs_status_check check(status in ('queued','running','waiting','paused','completed','failed','cancelled'));
create or replace function public.planner_vm_chat_control(p_username text,p_chat uuid,p_action text,p_job uuid default null,p_message text default '',p_attachments jsonb default '[]',p_payload jsonb default '[]') returns jsonb
language plpgsql security invoker set search_path=public as $$
declare c planner_vm_chats; j planner_vm_jobs; h uuid; n planner_vm_jobs; context text='';
begin
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
  select id into h from planner_vm_hosts where username=p_username and revoked_at is null;
  if h is null then raise exception 'Pair your private computer first'; end if;
  if j.id is not null and p_action='send' then
   if j.kind<>'chat' then raise exception 'This task cannot be steered'; end if;
   context=left(j.continuation_context||E'\nPrevious user request: '||j.message||E'\nSaved assistant progress: '||j.reply,100000);
   update planner_vm_jobs set status='cancelled',finished_at=now(),lease=null,lease_until=null,result=result||'{"steered":true}'::jsonb where id=j.id;
  end if;
  insert into planner_vm_jobs(username,chat_id,host_id,kind,message,thread_id,attachments,attachment_payload,continuation_context,fork_thread_id,fork_turn_id,branch_history,status,created_at)
   values(p_username,c.id,h,'chat',p_message,coalesce(j.thread_id,c.thread_id),p_attachments,p_payload,context,case when c.thread_id is null then c.fork_thread_id end,case when c.thread_id is null then c.fork_turn_id end,case when c.thread_id is null then c.branch_history else '[]'::jsonb end,case when (p_action='queue' and (j.id is not null or exists(select 1 from planner_vm_jobs where chat_id=c.id and status='waiting'))) or (p_action='send' and j.id is null and exists(select 1 from planner_vm_jobs where chat_id=c.id and status='waiting')) then 'waiting' else 'queued' end,clock_timestamp()) returning * into n;
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
 select j.* into v_job from planner_vm_jobs j where j.host_id=p_host and j.username=v_user
 and (j.status='queued' or (j.status='waiting' and not exists(select 1 from planner_vm_jobs a where a.chat_id=j.chat_id and a.status in ('queued','running','paused'))))
 and (j.chat_id is null or exists(select 1 from planner_vm_chats c where c.id=j.chat_id and c.username=v_user and not c.archived and c.deleted_at is null))
 order by j.created_at,j.id for update of j skip locked limit 1;
 if v_job.id is null then return null; end if;
 update planner_vm_jobs set status='running',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',started_at=now(),
 thread_id=case when v_job.status='waiting' then (select thread_id from planner_vm_chats where id=v_job.chat_id) else thread_id end,
 fork_thread_id=case when v_job.status='waiting' and exists(select 1 from planner_vm_chats where id=v_job.chat_id and thread_id is not null) then null else fork_thread_id end,
 fork_turn_id=case when v_job.status='waiting' and exists(select 1 from planner_vm_chats where id=v_job.chat_id and thread_id is not null) then null else fork_turn_id end,
 branch_history=case when v_job.status='waiting' and exists(select 1 from planner_vm_chats where id=v_job.chat_id and thread_id is not null) then '[]'::jsonb else branch_history end
 where id=v_job.id returning * into v_job;
 return to_jsonb(v_job);
end $$;


create or replace function public.planner_manage_chats(p_username text,p_ids uuid[],p_action text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare matched integer;
begin
  if cardinality(p_ids)<1 or cardinality(p_ids)>100 or p_action not in ('archive','restore','delete','untrash','purge') then raise exception 'Invalid chat selection.'; end if;
  perform 1 from planner_vm_chats where username=p_username and id=any(p_ids)
    and case when p_action in ('untrash','purge') then deleted_at is not null and (p_action='purge' or deleted_at>now()-interval '30 days') else deleted_at is null end for update;
  get diagnostics matched=row_count;
  if matched<>cardinality(p_ids) then raise exception 'Some selected chats are unavailable. Refresh the list.'; end if;
  if p_action='purge' then
    delete from planner_vm_chats where username=p_username and id=any(p_ids);
  elsif p_action='delete' then
    update planner_vm_chats set deleted_at=now(),updated_at=now() where username=p_username and id=any(p_ids);
    update planner_vm_jobs set status='cancelled',finished_at=now() where username=p_username and chat_id=any(p_ids) and status in ('queued','running','paused','waiting');
  elsif p_action='untrash' then
    update planner_vm_chats set deleted_at=null,updated_at=now() where username=p_username and id=any(p_ids);
  else
    update planner_vm_chats set archived=(p_action='archive'),updated_at=now() where username=p_username and id=any(p_ids);
  end if;
  return jsonb_build_object('ok',true,'ids',to_jsonb(p_ids),'count',matched);
end $$;
revoke all on function public.planner_manage_chats(text,uuid[],text) from public,anon,authenticated;
grant execute on function public.planner_manage_chats(text,uuid[],text) to service_role;

