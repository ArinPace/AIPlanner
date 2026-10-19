-- Partial browser checks must not erase unrelated connection statuses.
create or replace function public.planner_merge_browser_sites(p_username text,p_sites jsonb)
returns void language sql security invoker set search_path=public as $$
 update planner_vm_settings s
 set sites=coalesce(s.sites,'{}'::jsonb)||(
   select jsonb_object_agg(e.key,coalesce(s.sites->e.key,'{}'::jsonb)||e.value)
   from jsonb_each(case when jsonb_typeof(p_sites)='object' then p_sites else '{}'::jsonb end) e
   where e.key=any(s.sources) and jsonb_typeof(e.value->'ready')='boolean'
 ),updated_at=now()
 where s.username=p_username and exists(
   select 1 from jsonb_each(case when jsonb_typeof(p_sites)='object' then p_sites else '{}'::jsonb end) e
   where e.key=any(s.sources) and jsonb_typeof(e.value->'ready')='boolean'
 );
$$;
revoke all on function public.planner_merge_browser_sites(text,jsonb) from public,anon,authenticated;
grant execute on function public.planner_merge_browser_sites(text,jsonb) to service_role;

create or replace function public.planner_vm_report(p_host uuid,p_job uuid,p_lease uuid,p_reply text,p_error text,p_finished boolean,p_thread uuid,p_result jsonb default '{}') returns boolean
language plpgsql security invoker set search_path=public as $$
declare v_job planner_vm_jobs;
begin
 -- Match chat controls: lock the owner-scoped chat before its job row.
 perform 1 from planner_vm_chats c join planner_vm_jobs j on j.chat_id=c.id
 where j.id=p_job and j.host_id=p_host and j.lease=p_lease and c.username=j.username for update of c;
 update planner_vm_jobs j set reply=left(p_reply,80000),error=left(p_error,1000),result=p_result,
 status=case when p_finished then case when p_error is null then 'completed' else 'failed' end else 'running' end,
 finished_at=case when p_finished then now() else null end,lease_until=now()+interval '2 minutes',thread_id=coalesce(p_thread,j.thread_id)
 where j.id=p_job and j.host_id=p_host and j.lease=p_lease and j.status='running' and j.lease_until>now()
 and exists(select 1 from planner_vm_hosts h where h.id=p_host and h.username=j.username and h.revoked_at is null)
 returning * into v_job;
 if v_job.id is null then return false; end if;
 if v_job.chat_id is not null and p_thread is not null then
  update planner_vm_chats set thread_id=p_thread,updated_at=now() where id=v_job.chat_id and username=v_job.username;
 end if;
 if p_finished and p_error is null and v_job.kind='browser_check' then
  perform public.planner_merge_browser_sites(v_job.username,p_result->'sites');
 end if;
 return true;
end $$;
