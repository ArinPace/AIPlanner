create or replace function public.planner_connect_whoop(p_username text,p_user_id bigint,p_credentials text)
returns void language plpgsql security invoker set search_path=public as $$
begin
 -- Match the observation writer's lock order: connection, then dependent records.
 perform 1 from planner_whoop_connections where username=p_username for update;
 -- Reconnect replaces credentials and invalidates in-flight refreshes from the old authorization.
 delete from planner_whoop_records where username=p_username;
 delete from planner_whoop_events where username=p_username;
 insert into planner_whoop_connections(username,whoop_user_id,credentials) values(p_username,p_user_id,p_credentials)
 on conflict(username) do update set whoop_user_id=excluded.whoop_user_id,credentials=excluded.credentials,connected_at=clock_timestamp(),last_error=null,last_synced_at=null,refresh_lease_until=null;
 insert into planner_vm_settings(username,sources) values(p_username,array['whoop'])
 on conflict(username) do update set sources=case when 'whoop'=any(planner_vm_settings.sources) then planner_vm_settings.sources else array_append(planner_vm_settings.sources,'whoop') end,updated_at=clock_timestamp();
 update planner_whoop_reviews set next_at=null,updated_at=clock_timestamp() where username=p_username;
end $$;
