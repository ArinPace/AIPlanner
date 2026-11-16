-- All WHOOP consumer API read categories. The existing server-only RLS/grants remain unchanged.
alter table public.planner_whoop_connections
 add column granted_scopes text not null default 'offline read:profile read:sleep read:recovery',
 add column snapshot jsonb not null default '{}'::jsonb,
 add column snapshot_at timestamptz;
alter table public.planner_whoop_records drop constraint planner_whoop_records_kind_check;
alter table public.planner_whoop_records add constraint planner_whoop_records_kind_check check(kind in ('sleep','recovery','workout'));
create or replace function public.planner_store_whoop_record(p_username text,p_connection_at timestamptz,p_kind text,p_id uuid,p_data jsonb,p_fingerprint text,p_provider_updated_at timestamptz)
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
 ended=coalesce(nullif(p_data->>'sleepEnd',''),nullif(p_data->>'workoutEnd',''))::timestamptz;
 -- Do not wake an AI for processing/unchanged/history records. Deletions only matter if a known recent record existed.
 useful=((p_data->>'scoreState'='SCORED' and ended between now()-interval '48 hours' and now()+interval '5 minutes')
   or (p_data->>'deleted'='true' and coalesce(nullif(previous.data->>'sleepEnd',''),nullif(previous.data->>'workoutEnd',''))::timestamptz>now()-interval '48 hours'));
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
