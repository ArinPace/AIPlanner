-- Classification is independent of color tags, creator, or the planning lock.
create function public.planner_classify_events() returns trigger language plpgsql set search_path=public as $$
begin
 new.state:=jsonb_set(new.state,'{events}',coalesce((select jsonb_agg(e || jsonb_build_object('scheduleType',case
  when e->>'scheduleType' in ('fixed','planned') then e->>'scheduleType'
  when e->'planning' is not null and e->'planning'<>'null'::jsonb then 'planned'
  when exists(select 1 from jsonb_array_elements(coalesce(new.state->'tags','[]')) t where e->'tagIds' ? (t->>'id') and lower(trim(t->>'name')) ~ '^(to[- ]?do|maintenance|maintaince|breaks?|buffers?)$') then 'planned'
  else 'fixed' end)) from jsonb_array_elements(coalesce(new.state->'events','[]')) e),'[]'));
 return new;
end $$;
create trigger planner_classify_events before insert or update of state on public.planner_calendars for each row execute function public.planner_classify_events();
update public.planner_calendars set state=state,revision=revision+1,updated_at=now();

create table public.planner_google_fixed_sync(
 username text primary key references public.planner_calendars(username) on delete cascade,
 requested_revision bigint not null, completed_revision bigint not null default -1,
 lease uuid, lease_until timestamptz not null default '-infinity',
 retry_at timestamptz not null default now(), error text, synced_at timestamptz
);
create table public.planner_google_fixed_events(
 username text not null references public.planner_calendars(username) on delete cascade,
 account_id uuid not null references public.planner_google_accounts(id) on delete cascade,
 local_id text not null,remote_id text not null,managed boolean not null default true,
 fingerprint text not null,updated_at timestamptz not null default now(),
 primary key(username,account_id,local_id)
);
alter table public.planner_google_fixed_sync enable row level security;
alter table public.planner_google_fixed_events enable row level security;
revoke all on public.planner_google_fixed_sync,public.planner_google_fixed_events from public,anon,authenticated;
grant select,insert,update,delete on public.planner_google_fixed_sync,public.planner_google_fixed_events to service_role;

create function public.planner_queue_fixed_sync() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' or old.state->'events' is distinct from new.state->'events' then
  insert into planner_google_fixed_sync(username,requested_revision) values(new.username,new.revision)
  on conflict(username) do update set requested_revision=excluded.requested_revision,retry_at=now(),error=null;
 end if;
 return new;
end $$;
create trigger planner_queue_fixed_sync after insert or update of state on public.planner_calendars for each row execute function public.planner_queue_fixed_sync();
insert into public.planner_google_fixed_sync(username,requested_revision) select username,revision from public.planner_calendars;

create function public.planner_claim_fixed_sync(p_username text default null) returns setof public.planner_google_fixed_sync language sql set search_path=public as $$
 update planner_google_fixed_sync set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where username=(select username from planner_google_fixed_sync where (p_username is null or username=p_username) and requested_revision>completed_revision and lease_until<now() and retry_at<=now() order by retry_at for update skip locked limit 1)
 returning *;
$$;
revoke all on function public.planner_classify_events(),public.planner_queue_fixed_sync(),public.planner_claim_fixed_sync(text) from public,anon,authenticated;
grant execute on function public.planner_claim_fixed_sync(text) to service_role;
