-- One outbound-only worker per planner account. Only the server's service role
-- can access these tables; browser sessions use the existing planner API.
create table public.planner_vm_hosts (
 id uuid primary key default gen_random_uuid(), username text not null references public.planner_accounts(username) on delete cascade,
 token_hash text not null unique, label text not null, heartbeat_at timestamptz,
 capabilities jsonb not null default '{}', created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index planner_vm_one_host on public.planner_vm_hosts(username) where revoked_at is null;
create table public.planner_vm_pairings (
 code_hash text primary key, username text not null unique references public.planner_accounts(username) on delete cascade,
 expires_at timestamptz not null
);
create table public.planner_vm_settings (
 username text primary key references public.planner_accounts(username) on delete cascade,
 sources text[] not null default '{}', schedule_enabled boolean not null default false,
 credential text, ai_provider text, sites jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table public.planner_vm_chats (
 id uuid primary key default gen_random_uuid(), username text not null references public.planner_accounts(username) on delete cascade,
 title text not null, thread_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id, username)
);
create table public.planner_vm_jobs (
 id uuid primary key default gen_random_uuid(), username text not null references public.planner_accounts(username) on delete cascade,
 host_id uuid not null references public.planner_vm_hosts(id), chat_id uuid,
 kind text not null check (kind in ('chat','browser_login','browser_check','sync')),
 message text not null default '', reply text not null default '', result jsonb not null default '{}',
 status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
 lease uuid, lease_until timestamptz, thread_id uuid, error text, schedule_slot text,
 created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 foreign key (chat_id,username) references public.planner_vm_chats(id,username) on delete cascade,
 unique(username,schedule_slot)
);
create index planner_vm_jobs_claim on public.planner_vm_jobs(host_id,created_at) where status='queued';
create index planner_vm_jobs_history on public.planner_vm_jobs(username,chat_id,created_at);
create unique index planner_vm_chat_busy on public.planner_vm_jobs(chat_id) where status in ('queued','running');

alter table public.planner_vm_hosts enable row level security;
alter table public.planner_vm_pairings enable row level security;
alter table public.planner_vm_settings enable row level security;
alter table public.planner_vm_chats enable row level security;
alter table public.planner_vm_jobs enable row level security;
revoke all on public.planner_vm_hosts,public.planner_vm_pairings,public.planner_vm_settings,public.planner_vm_chats,public.planner_vm_jobs from anon,authenticated;
grant all on public.planner_vm_hosts,public.planner_vm_pairings,public.planner_vm_settings,public.planner_vm_chats,public.planner_vm_jobs to service_role;

create function public.planner_vm_enroll(p_code_hash text,p_token_hash text,p_label text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_user text; v_host uuid;
begin
 delete from planner_vm_pairings where code_hash=p_code_hash and expires_at>now() returning username into v_user;
 if v_user is null then return null; end if;
 update planner_vm_hosts set revoked_at=now() where username=v_user and revoked_at is null;
 update planner_vm_jobs set status='cancelled',finished_at=now() where username=v_user and status in ('queued','running');
 insert into planner_vm_hosts(username,token_hash,label) values(v_user,p_token_hash,left(p_label,100)) returning id into v_host;
 insert into planner_vm_settings(username) values(v_user) on conflict do nothing;
 return jsonb_build_object('id',v_host,'username',v_user);
end $$;

create function public.planner_vm_claim(p_host uuid) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare v_job planner_vm_jobs; v_user text;
begin
 select username into v_user from planner_vm_hosts where id=p_host and revoked_at is null for update;
 if v_user is null then return null; end if;
 -- Expired jobs fail visibly. Never silently replay a possibly completed write.
 update planner_vm_jobs set status='failed',error='Worker disconnected. Check the planner before retrying.',finished_at=now()
 where host_id=p_host and status='running' and lease_until<now();
 if exists(select 1 from planner_vm_jobs where host_id=p_host and status='running') then return null; end if;
 select * into v_job from planner_vm_jobs where host_id=p_host and username=v_user and status='queued' order by created_at for update skip locked limit 1;
 if v_job.id is null then return null; end if;
 update planner_vm_jobs set status='running',lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',started_at=now()
 where id=v_job.id returning * into v_job;
 return to_jsonb(v_job);
end $$;

create function public.planner_vm_report(p_host uuid,p_job uuid,p_lease uuid,p_reply text,p_error text,p_finished boolean,p_thread uuid,p_result jsonb default '{}') returns boolean
language plpgsql security invoker set search_path=public as $$
declare v_job planner_vm_jobs;
begin
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
  update planner_vm_settings set sites=coalesce(p_result->'sites','{}'),updated_at=now() where username=v_job.username;
 end if;
 return true;
end $$;
revoke all on function public.planner_vm_enroll(text,text,text), public.planner_vm_claim(uuid), public.planner_vm_report(uuid,uuid,uuid,text,text,boolean,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.planner_vm_enroll(text,text,text), public.planner_vm_claim(uuid), public.planner_vm_report(uuid,uuid,uuid,text,text,boolean,uuid,jsonb) to service_role;
