alter table public.planner_calendar_staging drop constraint planner_calendar_staging_pkey;
alter table public.planner_calendar_staging add primary key(id);
alter table public.planner_calendar_staging add column created_at timestamptz not null default now();
alter table public.planner_calendar_staging drop constraint planner_calendar_staging_status_check;
alter table public.planner_calendar_staging add check(status in ('draft','approved','stale','published','superseded'));
create index planner_calendar_stages_owner on public.planner_calendar_staging(username,created_at desc);
create index planner_calendar_stages_export on public.planner_calendar_staging(username,approved_revision)
 where approved_revision is not null;
alter table public.planner_google_fixed_sync add column claimed_stage_id uuid;
alter table public.planner_google_fixed_sync add column claimed_revision bigint;

create or replace function public.planner_claim_fixed_sync(p_username text default null)
returns setof public.planner_google_fixed_sync
language plpgsql security invoker set search_path=public as $$
declare queue planner_google_fixed_sync; draft planner_calendar_staging;
begin
 select q.* into queue from planner_google_fixed_sync q
 where (p_username is null or q.username=p_username)
   and q.requested_revision>q.completed_revision and q.lease_until<now() and q.retry_at<=now()
   and exists(select 1 from planner_calendar_staging s where s.username=q.username
       and s.status='approved' and s.approved_revision>q.completed_revision)
 order by q.retry_at for update of q skip locked limit 1;
 if not found then return; end if;
 select * into draft from planner_calendar_staging
 where username=queue.username and status='approved' and approved_revision>queue.completed_revision
 order by approved_revision,id limit 1;
 update planner_google_fixed_sync set lease=gen_random_uuid(),lease_until=now()+interval '2 minutes',
  claimed_stage_id=draft.id,claimed_revision=draft.approved_revision
 where username=queue.username returning * into queue;
 return next queue;
end $$;

create or replace function public.planner_publish_calendar_stage(p_username text,p_id uuid,p_version bigint,p_summary text)
returns bigint language plpgsql security invoker set search_path=public as $$
declare draft planner_calendar_staging; current_revision bigint; next_revision bigint;
begin
 select * into draft from planner_calendar_staging where username=p_username and id=p_id for update;
 if not found or draft.version<>p_version or draft.status<>'draft' then
  raise exception 'Staging version changed. Read the draft again.';
 end if;
 select revision into current_revision from planner_calendars where username=p_username for update;
 if current_revision<>draft.base_revision then raise exception 'Calendar changed. Refresh staging before publishing.'; end if;
 next_revision:=current_revision+1;
 update planner_calendars set state=draft.payload->'calendar',revision=next_revision,updated_at=now() where username=p_username;
 update planner_calendar_staging set status='approved',approved_revision=next_revision,review_summary=p_summary,updated_at=now()
 where username=p_username and id=p_id;
 -- A newly reviewed complete snapshot supersedes failed, stale exports, while
 -- approved batches keep their FIFO order and current lease.
 update planner_calendar_staging set status='superseded'
 where username=p_username and id<>p_id and status='stale' and approved_revision is not null;
 insert into planner_google_fixed_sync(username,requested_revision,reviewed_revision,retry_at)
 values(p_username,next_revision,next_revision,now())
 on conflict(username) do update set requested_revision=next_revision,reviewed_revision=next_revision,retry_at=now(),error=null;
 return next_revision;
end $$;
revoke all on function public.planner_claim_fixed_sync(text),public.planner_publish_calendar_stage(text,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.planner_claim_fixed_sync(text),public.planner_publish_calendar_stage(text,uuid,bigint,text) to service_role;
notify pgrst, 'reload schema';

create function public.planner_finish_fixed_stage(p_username text,p_stage uuid,p_lease uuid,p_complete boolean)
returns boolean language plpgsql security invoker set search_path=public as $$
declare queue planner_google_fixed_sync;
begin
 select * into queue from planner_google_fixed_sync where username=p_username for update;
 if not found or queue.lease is distinct from p_lease or queue.claimed_stage_id is distinct from p_stage or queue.lease_until<=now() then return false; end if;
 if p_complete then
  update planner_calendar_staging set status='published',updated_at=now()
   where username=p_username and id=p_stage and status='approved';
  if not found then return false; end if;
 end if;
 update planner_google_fixed_sync set
  completed_revision=case when p_complete then greatest(completed_revision,claimed_revision) else completed_revision end,
  synced_at=case when p_complete then now() else synced_at end,
  lease_until='epoch',retry_at=now(),error=null,claimed_stage_id=null,claimed_revision=null
 where username=p_username and lease=p_lease;
 return true;
end $$;
revoke all on function public.planner_finish_fixed_stage(text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.planner_finish_fixed_stage(text,uuid,uuid,boolean) to service_role;
