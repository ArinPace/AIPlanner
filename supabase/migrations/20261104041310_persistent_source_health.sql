create table public.planner_source_health (
 username text not null references public.planner_vm_settings(username) on delete cascade,
 source text not null, connection_key text not null,
 incident_id uuid not null default gen_random_uuid(),
 error text, first_detected_at timestamptz not null default now(), checked_at timestamptz not null default now(),
 primary key(username,source,connection_key)
);
alter table public.planner_source_health enable row level security;
revoke all on public.planner_source_health from public,anon,authenticated;
grant select,insert,update,delete on public.planner_source_health to service_role;
create function public.planner_report_source_health(p_username text,p_source text,p_connection_key text,p_error text)
returns void language sql security invoker set search_path=public as $$
 insert into planner_source_health(username,source,connection_key,error)
 select p_username,p_source,left(p_connection_key,200),left(p_error,1000)
 where exists(select 1 from planner_vm_settings where username=p_username and p_source=any(sources))
 on conflict(username,source,connection_key) do update set
 incident_id=case when planner_source_health.error is null and excluded.error is not null then gen_random_uuid() else planner_source_health.incident_id end,
 first_detected_at=case when planner_source_health.error is null and excluded.error is not null then now() else planner_source_health.first_detected_at end,
 error=excluded.error,checked_at=now();
$$;
revoke all on function public.planner_report_source_health(text,text,text,text) from public,anon,authenticated;
grant execute on function public.planner_report_source_health(text,text,text,text) to service_role;
