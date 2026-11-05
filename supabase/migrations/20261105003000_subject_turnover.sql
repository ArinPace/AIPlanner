alter table public.planner_vm_chats add column tutor_retired boolean not null default false;
create function public.planner_sync_tutor_chats(p_username text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare folders jsonb; roots text[]; active_ids text[]; added integer; retired integer; deferred integer;
begin
 if not exists(select 1 from planner_vm_settings where username=p_username and tutor_enabled) then return jsonb_build_object('enabled',false,'count',0); end if;
 perform pg_advisory_xact_lock(hashtextextended('planner-tutor:'||p_username,0));
 select state->'folders' into folders from planner_files where username=p_username;
 select array_agg(f->>'id') into roots from jsonb_array_elements(coalesce(folders,'[]'::jsonb)) f where f->>'parentId' is null and lower(trim(f->>'name'))='subjects';
 if roots is null then return jsonb_build_object('enabled',true,'count',0,'warning','Subjects root is unavailable; no chats were archived.'); end if;
 select coalesce(array_agg(f->>'id'),'{}'::text[]) into active_ids from jsonb_array_elements(folders) f where f->>'parentId'=any(roots);
 insert into planner_vm_chats(username,title,tutor_subject_id)
 select p_username,left(f->>'name',100),f->>'id' from jsonb_array_elements(folders) f where f->>'id'=any(active_ids)
 on conflict(username,tutor_subject_id) do update set title=excluded.title
 where planner_vm_chats.deleted_at is null and planner_vm_chats.title is distinct from excluded.title;
 get diagnostics added=row_count;
 update planner_vm_chats c set archived=true,tutor_retired=true,updated_at=now()
 where c.username=p_username and c.tutor_subject_id is not null and not c.tutor_retired and c.deleted_at is null and not(c.tutor_subject_id=any(active_ids))
 and not exists(select 1 from planner_vm_jobs j where j.username=p_username and j.chat_id=c.id and j.status in ('queued','running','paused','waiting'));
 get diagnostics retired=row_count;
 update planner_vm_chats set tutor_retired=false where username=p_username and tutor_retired and tutor_subject_id=any(active_ids);
 select count(*) into deferred from planner_vm_chats c where c.username=p_username and c.tutor_subject_id is not null and not c.tutor_retired and c.deleted_at is null and not(c.tutor_subject_id=any(active_ids));
 return jsonb_build_object('enabled',true,'count',cardinality(active_ids),'changed',added,'archived',retired,'deferred',deferred);
end $$;
revoke all on function public.planner_sync_tutor_chats(text) from public,anon,authenticated;
grant execute on function public.planner_sync_tutor_chats(text) to service_role;
create function public.planner_tutor_on_folders() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='UPDATE' then if old.state->'folders' is not distinct from new.state->'folders' then return new; end if; end if;
 perform planner_sync_tutor_chats(new.username);return new;
end $$;
revoke all on function public.planner_tutor_on_folders() from public,anon,authenticated;
create trigger planner_tutor_folder_sync after insert or update of state on public.planner_files for each row execute function public.planner_tutor_on_folders();

create table public.planner_subject_rollovers(
 username text primary key references public.planner_accounts(username) on delete cascade,
 next_at timestamptz, basis text not null default '',sources jsonb not null default '[]',revision bigint not null default 0,
 last_queued_at timestamptz,last_job_id uuid references public.planner_vm_jobs(id) on delete set null,updated_at timestamptz not null default now()
);
alter table public.planner_subject_rollovers enable row level security;
revoke all on public.planner_subject_rollovers from anon,authenticated;
grant all on public.planner_subject_rollovers to service_role;
create function public.planner_queue_subject_rollover(p_username text,p_host uuid,p_message text) returns uuid
language plpgsql security invoker set search_path=public as $$
declare schedule planner_subject_rollovers; chat uuid; thread uuid; job uuid;
begin
 if not exists(select 1 from planner_vm_hosts where id=p_host and username=p_username and revoked_at is null) then raise exception 'Host unavailable'; end if;
 select * into schedule from planner_subject_rollovers where username=p_username for update;
 if not found or schedule.next_at is null or schedule.next_at>now() or schedule.last_queued_at>=schedule.next_at then return null; end if;
 chat=planner_ensure_main_chat(p_username);
 if exists(select 1 from planner_vm_jobs where username=p_username and chat_id=chat and status in ('queued','running','paused','waiting')) then return null; end if;
 select thread_id into thread from planner_vm_chats where id=chat and username=p_username;
 insert into planner_vm_jobs(username,host_id,chat_id,thread_id,kind,message,schedule_slot)
 values(p_username,p_host,chat,thread,'sync',p_message,'subject-turnover:'||schedule.next_at::text)
 on conflict(username,schedule_slot) do nothing returning id into job;
 if job is not null then update planner_subject_rollovers set last_queued_at=schedule.next_at,last_job_id=job,updated_at=now() where username=p_username; end if;
 return job;
end $$;
revoke all on function public.planner_queue_subject_rollover(text,uuid,text) from public,anon,authenticated;
grant execute on function public.planner_queue_subject_rollover(text,uuid,text) to service_role;
create function public.planner_subject_job_finished() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.status in ('completed','failed','cancelled') and old.status is distinct from new.status then
  -- If the agent failed to schedule the following handoff, keep the chain alive.
  update planner_subject_rollovers set next_at=((now() at time zone 'America/New_York')::date+1+time '09:00') at time zone 'America/New_York',
   basis=left('Retry: preceding turnover ended without scheduling the next handoff. '||basis,4000),revision=revision+1,updated_at=now()
  where username=new.username and last_job_id=new.id and next_at<=now();
  if exists(select 1 from planner_vm_chats where username=new.username and id=new.chat_id and tutor_subject_id is not null) then perform planner_sync_tutor_chats(new.username); end if;
 end if;
 return new;
end $$;
revoke all on function public.planner_subject_job_finished() from public,anon,authenticated;
create trigger planner_subject_finish after update of status on public.planner_vm_jobs for each row execute function public.planner_subject_job_finished();
