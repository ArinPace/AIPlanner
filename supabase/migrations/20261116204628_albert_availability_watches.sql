create table public.planner_albert_watches (
 id uuid primary key default gen_random_uuid(),
 username text not null references public.planner_accounts(username) on delete cascade,
 title text not null,url text not null,config jsonb not null,
 enabled boolean not null default false,
 next_at timestamptz not null default now(),
 lease uuid,lease_until timestamptz,host_id uuid references public.planner_vm_hosts(id),
 last_checked_at timestamptz,last_status text not null default 'unknown' check(last_status in ('open','closed','unknown')),
 last_detail text not null default '',last_error text,
 change_number bigint not null default 0,last_alert_job_id uuid references public.planner_vm_jobs(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp()
);
alter table public.planner_albert_watches enable row level security;
revoke all on public.planner_albert_watches from public,anon,authenticated;
grant all on public.planner_albert_watches to service_role;
create index planner_albert_watches_due on public.planner_albert_watches(next_at) where enabled;
create function public.planner_claim_albert_watch(p_host uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare h planner_vm_hosts; w planner_albert_watches;
begin
 select * into h from planner_vm_hosts where id=p_host and revoked_at is null;
 if not found or not exists(select 1 from planner_vm_settings where username=h.username and 'albert'=any(sources)) then return null; end if;
 select * into w from planner_albert_watches where username=h.username and enabled and next_at<=now() and (lease_until is null or lease_until<now()) order by next_at for update skip locked limit 1;
 if not found then return null; end if;
 update planner_albert_watches set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',host_id=p_host where id=w.id returning * into w;
 return to_jsonb(w);
end $$;
create function public.planner_report_albert_watch(p_username text,p_host uuid,p_id uuid,p_lease uuid,p_status text,p_detail text,p_chat uuid,p_message text) returns boolean
language plpgsql security invoker set search_path=public as $$
declare w planner_albert_watches; n bigint; j uuid;
begin
 if p_status not in ('open','closed','unknown') then raise exception 'Invalid availability status'; end if;
 select * into w from planner_albert_watches where id=p_id and username=p_username and enabled and host_id=p_host and lease=p_lease and lease_until>now() for update;
 if not found or not exists(select 1 from planner_vm_hosts where id=p_host and username=p_username and revoked_at is null) then return false; end if;
 n=w.change_number;
 if p_status<>'unknown' and p_status<>w.last_status then n=n+1; end if;
 if p_status='open' and w.last_status<>'open' then
  if not exists(select 1 from planner_vm_chats where id=p_chat and username=p_username and is_main and not archived and deleted_at is null) then return false; end if;
  insert into planner_vm_jobs(username,host_id,chat_id,kind,status,schedule_slot,message)
  values(p_username,p_host,p_chat,'chat','waiting','albert:'||p_id::text||':'||n::text,p_message)
  on conflict(username,schedule_slot) do nothing returning id into j;
 end if;
 update planner_albert_watches set last_status=case when p_status='unknown' then last_status else p_status end,last_checked_at=clock_timestamp(),last_detail=left(p_detail,1000),last_error=case when p_status='unknown' then left(p_detail,1000) else null end,change_number=n,last_alert_job_id=coalesce(j,last_alert_job_id),next_at=now()+make_interval(mins=>greatest(2,least(1440,coalesce((config->>'intervalMinutes')::integer,5)))),lease=null,lease_until=null where id=p_id;
 return true;
end $$;
revoke all on function public.planner_claim_albert_watch(uuid),public.planner_report_albert_watch(text,uuid,uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.planner_claim_albert_watch(uuid),public.planner_report_albert_watch(text,uuid,uuid,uuid,text,text,uuid,text) to service_role;
create unique index planner_albert_watches_class on public.planner_albert_watches(username,url,(config->>'identityText'));
