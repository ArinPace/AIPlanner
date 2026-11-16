-- Server-only WHOOP OAuth credentials, signed deliveries and verified API observations.
create table public.planner_whoop_connections (
 username text primary key references public.planner_accounts(username) on delete cascade,
 whoop_user_id bigint not null unique check(whoop_user_id>0),
 credentials text not null,
 connected_at timestamptz not null default clock_timestamp(),
 last_synced_at timestamptz,
 last_webhook_at timestamptz,
 last_error text,
 refresh_lease_until timestamptz
);
create table public.planner_whoop_oauth_attempts (
 state_hash text primary key,
 username text not null references public.planner_accounts(username) on delete cascade,
 browser_hash text not null,
 expires_at timestamptz not null
);
create table public.planner_whoop_events (
 trace_id text primary key,
 username text not null references public.planner_whoop_connections(username) on delete cascade,
 event jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 processed_at timestamptz,
 last_error text
);
create index planner_whoop_events_pending on public.planner_whoop_events(created_at) where processed_at is null;
create table public.planner_whoop_records (
 username text not null references public.planner_whoop_connections(username) on delete cascade,
 kind text not null check(kind in ('sleep','recovery')),
 object_id uuid not null,
 fingerprint text not null,
 data jsonb not null,
 provider_updated_at timestamptz not null,
 observed_at timestamptz not null default clock_timestamp(),
 primary key(username,kind,object_id)
);
alter table public.planner_whoop_connections enable row level security;
alter table public.planner_whoop_oauth_attempts enable row level security;
alter table public.planner_whoop_events enable row level security;
alter table public.planner_whoop_records enable row level security;
revoke all on public.planner_whoop_connections,public.planner_whoop_oauth_attempts,public.planner_whoop_events,public.planner_whoop_records from public,anon,authenticated;
grant all on public.planner_whoop_connections,public.planner_whoop_oauth_attempts,public.planner_whoop_events,public.planner_whoop_records to service_role;

create function public.planner_connect_whoop(p_username text,p_user_id bigint,p_credentials text)
returns void language plpgsql security invoker set search_path=public as $$
begin
 -- Reconnect replaces credentials and invalidates in-flight refreshes from the old authorization.
 delete from planner_whoop_records where username=p_username;
 delete from planner_whoop_events where username=p_username;
 insert into planner_whoop_connections(username,whoop_user_id,credentials) values(p_username,p_user_id,p_credentials)
 on conflict(username) do update set whoop_user_id=excluded.whoop_user_id,credentials=excluded.credentials,connected_at=clock_timestamp(),last_error=null,last_synced_at=null,refresh_lease_until=null;
 insert into planner_vm_settings(username,sources) values(p_username,array['whoop'])
 on conflict(username) do update set sources=case when 'whoop'=any(planner_vm_settings.sources) then planner_vm_settings.sources else array_append(planner_vm_settings.sources,'whoop') end,updated_at=clock_timestamp();
 update planner_whoop_reviews set next_at=null,updated_at=clock_timestamp() where username=p_username;
end $$;
create function public.planner_disconnect_whoop(p_username text)
returns void language plpgsql security invoker set search_path=public as $$
begin
 delete from planner_whoop_connections where username=p_username;
 delete from planner_whoop_oauth_attempts where username=p_username;
 update planner_whoop_reviews set next_at=null,updated_at=clock_timestamp() where username=p_username;
 -- Remove the source so an intentional disconnect cannot silently restart browser polling.
 update planner_vm_settings set sources=array_remove(sources,'whoop'),updated_at=clock_timestamp() where username=p_username;
end $$;
create function public.planner_store_whoop_record(p_username text,p_connection_at timestamptz,p_kind text,p_id uuid,p_data jsonb,p_fingerprint text,p_provider_updated_at timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
declare previous planner_whoop_records; prefs planner_vm_settings; ch text; useful boolean; ended timestamptz;
begin
 -- Serialize data changes with disconnect/reconnect; stale authorization can never recreate deleted data.
 perform 1 from planner_whoop_connections where username=p_username and connected_at=p_connection_at for update;
 if not found then return false; end if;
 select * into previous from planner_whoop_records where username=p_username and kind=p_kind and object_id=p_id for update;
 if found then
  if previous.provider_updated_at>p_provider_updated_at then return false; end if;
  if previous.fingerprint=p_fingerprint then
   update planner_whoop_records set provider_updated_at=p_provider_updated_at where username=p_username and kind=p_kind and object_id=p_id;
   return false;
  end if;
 end if;
 insert into planner_whoop_records(username,kind,object_id,data,fingerprint,provider_updated_at)
 values(p_username,p_kind,p_id,p_data,p_fingerprint,p_provider_updated_at)
 on conflict(username,kind,object_id) do update set data=excluded.data,fingerprint=excluded.fingerprint,provider_updated_at=excluded.provider_updated_at,observed_at=clock_timestamp();
 select * into prefs from planner_vm_settings where username=p_username;
 if not found or not ('whoop'=any(prefs.sources)) then return true; end if;
 ended=nullif(p_data->>'sleepEnd','')::timestamptz;
 -- Do not wake an AI for processing/unchanged/history records. Deletions only matter if a known recent record existed.
 useful=((p_data->>'scoreState'='SCORED' and ended between now()-interval '48 hours' and now()+interval '5 minutes')
   or (p_data->>'deleted'='true' and nullif(previous.data->>'sleepEnd','')::timestamptz>now()-interval '48 hours'));
 if coalesce(useful,false) then
  foreach ch in array array['agent','chat'] loop
   if (ch='agent' and prefs.schedule_enabled) or (ch='chat' and prefs.subscription_schedule_enabled) then
    insert into planner_whoop_reviews(username,channel,episode,status,next_at)
    values(p_username,ch,'whoop-api:'||clock_timestamp()::text,'pending',now()+interval '30 seconds')
    on conflict(username,channel) do update set episode=excluded.episode,status='pending',next_at=excluded.next_at,updated_at=clock_timestamp();
   end if;
  end loop;
 end if;
 return true;
end $$;
revoke all on function public.planner_connect_whoop(text,bigint,text),public.planner_disconnect_whoop(text),public.planner_store_whoop_record(text,timestamptz,text,uuid,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.planner_connect_whoop(text,bigint,text),public.planner_disconnect_whoop(text),public.planner_store_whoop_record(text,timestamptz,text,uuid,jsonb,text,timestamptz) to service_role;

-- Browser-only accounts keep their existing fallback. OAuth accounts wake only on verified changes.
create or replace function public.planner_arm_whoop_review(p_username text,p_channel text,p_episode text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from planner_whoop_connections where username=p_username) then return; end if;
 if not exists(select 1 from planner_vm_settings where username=p_username and 'whoop'=any(sources) and case when p_channel='agent' then schedule_enabled else subscription_schedule_enabled end) then return; end if;
 insert into planner_whoop_reviews(username,channel,episode,next_at) values(p_username,p_channel,p_episode,now()+interval '1 hour')
 on conflict(username,channel) do update set episode=excluded.episode,status='pending',next_at=least(coalesce(planner_whoop_reviews.next_at,excluded.next_at),excluded.next_at),updated_at=clock_timestamp()
 where planner_whoop_reviews.episode<>excluded.episode;
end $$;
create or replace function public.planner_queue_whoop_review(p_username text,p_host uuid,p_message text)
returns boolean language plpgsql security definer set search_path=public as $$
declare r planner_whoop_reviews; c planner_vm_chats; j uuid;
begin
 if not exists(select 1 from planner_vm_hosts where id=p_host and username=p_username and revoked_at is null) or not exists(select 1 from planner_vm_settings where username=p_username and schedule_enabled and 'whoop'=any(sources)) then return false; end if;
 select * into r from planner_whoop_reviews where username=p_username and channel='agent' and next_at<=now() for update skip locked;
 if not found then return false; end if;
 select * into c from planner_vm_chats where username=p_username and is_main and deleted_at is null and not archived;
 if not found or exists(select 1 from planner_vm_jobs where username=p_username and chat_id=c.id and status in ('queued','running','waiting','paused')) then return false; end if;
 insert into planner_vm_jobs(username,host_id,chat_id,thread_id,kind,schedule_slot,message)
 values(p_username,p_host,c.id,c.thread_id,'sync','whoop:'||r.next_at::text,p_message)
 on conflict(username,schedule_slot) do nothing returning id into j;
 if j is null then return false; end if;
 update planner_whoop_reviews set next_at=case when exists(select 1 from planner_whoop_connections where username=p_username) then null else now()+interval '1 hour' end,updated_at=clock_timestamp() where username=p_username and channel='agent';
 return true;
end $$;
revoke all on function public.planner_arm_whoop_review(text,text,text), public.planner_queue_whoop_review(text,uuid,text) from public,anon,authenticated;
grant execute on function public.planner_arm_whoop_review(text,text,text), public.planner_queue_whoop_review(text,uuid,text) to service_role;
create or replace function public.planner_claim_whoop_chat(p_username text)
returns uuid language plpgsql security definer set search_path=public as $$
declare r planner_whoop_reviews; j uuid;
begin
 if not exists(select 1 from planner_vm_settings where username=p_username and subscription_schedule_enabled and 'whoop'=any(sources)) then return null; end if;
 select * into r from planner_whoop_reviews where username=p_username and channel='chat' and next_at<=now() for update skip locked;
 if not found then return null; end if;
 insert into planner_subscription_reviews(username,slot) values(p_username,'whoop:'||r.next_at::text) on conflict(username,slot) do nothing returning id into j;
 if j is null then return null; end if;
 update planner_whoop_reviews set next_at=case when exists(select 1 from planner_whoop_connections where username=p_username) then null else now()+interval '1 hour' end,updated_at=clock_timestamp() where username=p_username and channel='chat';
 return j;
end $$;
revoke all on function public.planner_claim_whoop_chat(text) from public,anon,authenticated;
grant execute on function public.planner_claim_whoop_chat(text) to service_role;
