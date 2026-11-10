-- Checklist links/checkmarks are internal progress, not a new Google edit.
create or replace function public.planner_queue_fixed_sync() returns trigger language plpgsql set search_path=public as $$
declare before_events jsonb; after_events jsonb;
begin
 if tg_op='INSERT' then
  insert into planner_google_fixed_sync(username,requested_revision) values(new.username,new.revision)
  on conflict(username) do update set requested_revision=excluded.requested_revision,retry_at=now(),error=null;
 else
  select coalesce(jsonb_agg(e-'checklistLinks'-'completedStarts' order by ord),'[]'::jsonb) into before_events from jsonb_array_elements(coalesce(old.state->'events','[]'::jsonb)) with ordinality items(e,ord);
  select coalesce(jsonb_agg(e-'checklistLinks'-'completedStarts' order by ord),'[]'::jsonb) into after_events from jsonb_array_elements(coalesce(new.state->'events','[]'::jsonb)) with ordinality items(e,ord);
  if before_events is distinct from after_events then
   insert into planner_google_fixed_sync(username,requested_revision) values(new.username,new.revision)
   on conflict(username) do update set requested_revision=excluded.requested_revision,retry_at=now(),error=null;
  end if;
 end if;
 return new;
end $$;
