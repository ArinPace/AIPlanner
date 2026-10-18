alter table public.planner_vm_jobs drop constraint planner_vm_jobs_status_check;
alter table public.planner_vm_jobs add constraint planner_vm_jobs_status_check check(status in ('queued','running','paused','completed','failed','cancelled'));
alter table public.planner_vm_jobs add column continuation boolean not null default false,
 add column continuation_context text not null default '';
drop index public.planner_vm_chat_busy;
create unique index planner_vm_chat_busy on public.planner_vm_jobs(chat_id) where status in ('queued','running','paused');

-- Serialize chat controls and sends. Retired leases cannot report or mutate the planner.
create function public.planner_vm_chat_control(p_username text,p_chat uuid,p_action text,p_job uuid default null,p_message text default '',p_attachments jsonb default '[]',p_payload jsonb default '[]') returns jsonb
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
 elsif p_action='send' then
  if length(trim(p_message))=0 or length(p_message)>12000 then raise exception 'Message required'; end if;
  select id into h from planner_vm_hosts where username=p_username and revoked_at is null;
  if h is null then raise exception 'Pair your private computer first'; end if;
  if j.id is not null then
   if j.kind<>'chat' then raise exception 'This task cannot be steered'; end if;
   context=left(j.continuation_context||E'\nPrevious user request: '||j.message||E'\nSaved assistant progress: '||j.reply,100000);
   update planner_vm_jobs set status='cancelled',finished_at=now(),lease=null,lease_until=null,result=result||'{"steered":true}'::jsonb where id=j.id;
  end if;
  insert into planner_vm_jobs(username,chat_id,host_id,kind,message,thread_id,attachments,attachment_payload,continuation_context)
   values(p_username,c.id,h,'chat',p_message,coalesce(j.thread_id,c.thread_id),p_attachments,p_payload,context) returning * into n;
 else raise exception 'Unknown chat control';
 end if;
 update planner_vm_chats set updated_at=now() where id=c.id;
 return jsonb_build_object('id',n.id,'status',n.status,'steered',p_action='send' and j.id is not null);
end $$;
revoke all on function public.planner_vm_chat_control(text,uuid,text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.planner_vm_chat_control(text,uuid,text,uuid,text,jsonb,jsonb) to service_role;
