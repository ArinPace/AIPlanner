alter table public.planner_google_fixed_sync add column reviewed_revision bigint not null default -1;
alter table public.planner_google_fixed_events add column remote_etag text;
alter table public.planner_google_fixed_events add column applied_stage_id uuid;
create table public.planner_calendar_staging(
 username text primary key references public.planner_calendars(username) on delete cascade,
 id uuid not null default gen_random_uuid(),
 version bigint not null default 1,
 base_revision bigint not null,
 account_id uuid not null references public.planner_google_accounts(id) on delete cascade,
 status text not null default 'draft' check(status in ('draft','approved','stale','published')),
 approved_revision bigint,
 payload jsonb not null,
 review_summary text,
 updated_at timestamptz not null default now()
);
alter table public.planner_calendar_staging enable row level security;
revoke all on public.planner_calendar_staging from public,anon,authenticated;
grant select,insert,update,delete on public.planner_calendar_staging to service_role;
-- Fail closed even while the previous application deployment is still running.
create or replace function public.planner_claim_fixed_sync(p_username text default null)
returns setof public.planner_google_fixed_sync language sql set search_path=public as $$
 update planner_google_fixed_sync set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where username=(select username from planner_google_fixed_sync
 where (p_username is null or username=p_username) and requested_revision>completed_revision
 and reviewed_revision=requested_revision and lease_until<now() and retry_at<=now()
 order by retry_at for update skip locked limit 1) returning *;
$$;
create function public.planner_publish_calendar_stage(p_username text,p_id uuid,p_version bigint,p_summary text)
returns bigint language plpgsql set search_path=public as $$
declare draft planner_calendar_staging; current_revision bigint; next_revision bigint;
begin
 select * into draft from planner_calendar_staging where username=p_username for update;
 if not found or draft.id<>p_id or draft.version<>p_version or draft.status<>'draft' then
  raise exception 'Staging version changed. Read the draft again.';
 end if;
 select revision into current_revision from planner_calendars where username=p_username for update;
 if current_revision<>draft.base_revision then raise exception 'Calendar changed. Refresh staging before publishing.';end if;
 if exists(select 1 from planner_google_fixed_sync where username=p_username and lease_until>now()) then
  raise exception 'A calendar batch is still running. Retry after it finishes.';
 end if;
 next_revision:=current_revision+1;
 update planner_calendars set state=draft.payload->'calendar',revision=next_revision,updated_at=now() where username=p_username;
 update planner_calendar_staging set status='approved',approved_revision=next_revision,review_summary=p_summary,updated_at=now() where username=p_username;
 insert into planner_google_fixed_sync(username,requested_revision,reviewed_revision,retry_at)
 values(p_username,next_revision,next_revision,now())
 on conflict(username) do update set requested_revision=next_revision,reviewed_revision=next_revision,retry_at=now(),error=null;
 return next_revision;
end $$;
revoke all on function public.planner_publish_calendar_stage(text,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.planner_publish_calendar_stage(text,uuid,bigint,text) to service_role;
