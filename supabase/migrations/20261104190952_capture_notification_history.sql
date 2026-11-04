-- Capture notices when they happen, including while the sidebar is closed.
create function public.planner_capture_notification() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='planner_source_health' then
  if new.error is not null and new.error<>'' then
   insert into planner_notification_inbox(username,id,title,message,kind)
   values(new.username,'health:'||new.incident_id::text,initcap(new.source)||' connection',new.error,'source')
   on conflict(username,id) do update set message=excluded.message;
  end if;
 elsif new.result->>'connected'='true' and coalesce(new.result->>'source','')<>'' then
  insert into planner_notification_inbox(username,id,title,message,kind)
  values(new.username,'connected:'||new.id::text,initcap(new.result->>'source')||' connected','Connection verified. Your sign-in is saved on your private computer.','connection')
  on conflict(username,id) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.planner_capture_notification() from public,anon,authenticated;
create trigger planner_source_notification after insert or update on public.planner_source_health for each row execute function public.planner_capture_notification();
create trigger planner_connection_notification after insert or update on public.planner_vm_jobs for each row when (new.kind in ('browser_check','browser_login')) execute function public.planner_capture_notification();
