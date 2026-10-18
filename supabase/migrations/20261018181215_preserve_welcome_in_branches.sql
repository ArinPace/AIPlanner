create or replace function public.planner_branch_chat(p_username text,p_job uuid,p_edit text default null) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare j planner_vm_jobs; c planner_vm_chats; n planner_vm_chats; previous planner_vm_jobs; history jsonb; sent jsonb;
begin
 select * into j from planner_vm_jobs where id=p_job and username=p_username and kind='chat';
 if j.id is null then raise exception 'Message unavailable'; end if;
 select * into c from planner_vm_chats where id=j.chat_id and username=p_username and deleted_at is null for update;
 if c.id is null then raise exception 'Chat unavailable'; end if;
 if p_edit is null and j.status<>'completed' then raise exception 'Choose a completed reply to branch'; end if;
 if p_edit is not null and (length(trim(p_edit))=0 or length(p_edit)>12000) then raise exception 'Enter a message of 1 to 12000 characters'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('message',x.message,'reply',x.reply,'attachments',x.attachment_payload,'status',x.status) order by x.created_at,x.id),'[]') into history
 from planner_vm_jobs x where x.username=p_username and x.chat_id=c.id and x.kind='chat' and (x.created_at,x.id)<=(j.created_at,j.id) and (p_edit is null or x.id<>j.id);
 if pg_column_size(history)>12582912 then raise exception 'This branch history exceeds the 12 MB limit'; end if;
 select * into previous from planner_vm_jobs x where x.username=p_username and x.chat_id=c.id and x.kind='chat' and (x.created_at,x.id)<=(j.created_at,j.id) and (p_edit is null or x.id<>j.id) order by x.created_at desc,x.id desc limit 1;
 insert into planner_vm_chats(username,title,parent_chat_id,parent_job_id,branch_history,fork_thread_id,fork_turn_id)
 values(p_username,left(case when p_edit is null then 'Branch · ' else 'Edit · ' end||c.title,100),c.id,j.id,history,case when previous.status='completed' then previous.thread_id end,case when previous.status='completed' then previous.native_turn_id end) returning * into n;
 insert into planner_vm_jobs(username,host_id,chat_id,kind,message,reply,result,status,created_at,started_at,finished_at,thread_id,native_turn_id,attachments,attachment_payload,is_welcome)
 select x.username,x.host_id,n.id,x.kind,x.message,x.reply,x.result||'{"branchCopy":true}',case when x.status='completed' then 'completed' else 'cancelled' end,x.created_at,x.started_at,x.finished_at,x.thread_id,x.native_turn_id,x.attachments,x.attachment_payload,x.is_welcome
 from planner_vm_jobs x where x.username=p_username and x.chat_id=c.id and x.kind='chat' and (x.created_at,x.id)<=(j.created_at,j.id) and (p_edit is null or x.id<>j.id);
 if p_edit is not null then
  sent=planner_vm_chat_control(p_username,n.id,'send',null,p_edit,j.attachments,j.attachment_payload);
 end if;
 return jsonb_build_object('id',n.id,'title',n.title,'parent_chat_id',c.id,'parent_job_id',j.id,'job',sent);
end $$;
revoke all on function public.planner_branch_chat(text,uuid,text) from public,anon,authenticated;
grant execute on function public.planner_branch_chat(text,uuid,text) to service_role;
