create or replace function public.planner_report_albert_watch(p_username text,p_host uuid,p_id uuid,p_lease uuid,p_status text,p_detail text,p_chat uuid,p_message text) returns boolean
language plpgsql security invoker set search_path=public as $$
declare w planner_albert_watches; n bigint; j uuid;
begin
 if p_status not in ('open','closed','unknown') then raise exception 'Invalid availability status'; end if;
 select * into w from planner_albert_watches where id=p_id and username=p_username and enabled and host_id=p_host and lease=p_lease and lease_until>now() for update;
 if not found or not exists(select 1 from planner_vm_hosts where id=p_host and username=p_username and revoked_at is null) then return false; end if;
 n=w.change_number;
 if p_status<>'unknown' and p_status<>w.last_status then n=n+1; end if;
 if (p_status='open' and w.last_status<>'open') or (p_status='closed' and w.last_status='open') then
  if not exists(select 1 from planner_vm_chats where id=p_chat and username=p_username and is_main and not archived and deleted_at is null) then return false; end if;
  insert into planner_vm_jobs(username,host_id,chat_id,kind,status,schedule_slot,message)
  values(p_username,p_host,p_chat,'chat','waiting','albert:'||p_id::text||':'||n::text,p_message)
  on conflict(username,schedule_slot) do nothing returning id into j;
 end if;
 update planner_albert_watches set last_status=case when p_status='unknown' then last_status else p_status end,last_checked_at=clock_timestamp(),last_detail=left(p_detail,1000),last_error=case when p_status='unknown' then left(p_detail,1000) else null end,change_number=n,last_alert_job_id=coalesce(j,last_alert_job_id),next_at=now()+make_interval(secs=>case when p_status='unknown' then 120 else greatest(15,least(86400,coalesce((config->>'intervalSeconds')::integer,coalesce((config->>'intervalMinutes')::integer,5)*60))) end),lease=null,lease_until=null where id=p_id;
 return true;
end $$;
