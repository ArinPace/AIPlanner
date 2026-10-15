create table public.planner_vm_pools (
 id uuid primary key default gen_random_uuid(), operator text not null references public.planner_accounts(username),
 token_hash text not null unique, label text not null default 'Windows agent host', max_vms integer not null default 4 check(max_vms between 1 and 16),
 heartbeat_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.planner_vm_provisioning (
 username text primary key references public.planner_accounts(username) on delete cascade,
 status text not null default 'queued' check(status in ('queued','provisioning','ready','failed')),
 pool_id uuid references public.planner_vm_pools(id), lease uuid, lease_until timestamptz,
 error text, wake_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index planner_vm_provisioning_queue on public.planner_vm_provisioning(created_at) where status='queued';
alter table public.planner_vm_pools enable row level security;
alter table public.planner_vm_provisioning enable row level security;
revoke all on public.planner_vm_pools,public.planner_vm_provisioning from anon,authenticated;
grant all on public.planner_vm_pools,public.planner_vm_provisioning to service_role;
create function public.planner_vm_provision_claim(p_pool uuid,p_code_hash text,p_vm_count integer) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_limit integer; v_job planner_vm_provisioning;
begin
 select max_vms into v_limit from planner_vm_pools where id=p_pool and revoked_at is null for update;
 if v_limit is null or p_vm_count>=v_limit then return null; end if;
 update planner_vm_provisioning set status='queued',lease=null,lease_until=null where pool_id=p_pool and status='provisioning' and lease_until<now();
 if exists(select 1 from planner_vm_provisioning where pool_id=p_pool and status='provisioning') then return null; end if;
 select * into v_job from planner_vm_provisioning where status='queued' order by created_at for update skip locked limit 1;
 if v_job.username is null then return null; end if;
 update planner_vm_provisioning set status='provisioning',pool_id=p_pool,lease=gen_random_uuid(),lease_until=now()+interval '1 hour',updated_at=now()
 where username=v_job.username returning * into v_job;
 insert into planner_vm_pairings(username,code_hash,expires_at) values(v_job.username,p_code_hash,now()+interval '1 hour')
 on conflict(username) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
 return to_jsonb(v_job);
end $$;
revoke all on function public.planner_vm_provision_claim(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.planner_vm_provision_claim(uuid,text,integer) to service_role;
-- Existing accounts also get their own environment; no shared browser profile.
insert into public.planner_vm_provisioning(username)
select a.username from public.planner_accounts a where not exists(select 1 from public.planner_vm_hosts h where h.username=a.username and h.revoked_at is null)
on conflict do nothing;
