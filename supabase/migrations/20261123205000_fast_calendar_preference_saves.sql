-- Preference-only updates must not diff every event or requeue Google changes.
create or replace function public.planner_capture_calendar_history() returns trigger language plpgsql set search_path=public as $$
declare item record; previous jsonb;
begin
 previous:=case when tg_op='INSERT' then '{}'::jsonb else old.state end;
 if previous->'events' is distinct from new.state->'events' then
 for item in
  select coalesce(a.value->>'id',b.value->>'id') event_id,b.value prev,a.value next
  from jsonb_array_elements(coalesce(previous->'events','[]'::jsonb)) b
  full join jsonb_array_elements(coalesce(new.state->'events','[]'::jsonb)) a on a.value->>'id'=b.value->>'id'
 loop
  if item.prev is distinct from item.next then
   insert into planner_calendar_history(username,event_id,title,kind,before,after,calendar_revision)
   values(new.username,item.event_id,coalesce(item.next->>'title',item.prev->>'title',''),case when item.next is null then 'removed' when item.prev is null then 'created' else 'updated' end,item.prev,item.next,new.revision);
  end if;
 end loop;
 end if;
 if previous->'tags' is distinct from new.state->'tags' then
  insert into planner_calendar_history(username,title,kind,before,after,calendar_revision)
  values(new.username,'Calendar tags','tags',previous->'tags',new.state->'tags',new.revision);
 end if;
 return new;
end $$;

-- Checklist links/checkmarks are internal progress, not a new Google edit.
create or replace function public.planner_queue_fixed_sync() returns trigger language plpgsql set search_path=public as $$
declare before_events jsonb; after_events jsonb;
begin
 if tg_op='INSERT' then
  insert into planner_google_fixed_sync(username,requested_revision) values(new.username,new.revision)
  on conflict(username) do update set requested_revision=excluded.requested_revision,retry_at=now(),error=null;
 else
  if old.state->'events' is not distinct from new.state->'events' then return new; end if;
  select coalesce(jsonb_agg(e-'checklistLinks'-'completedStarts' order by ord),'[]'::jsonb) into before_events from jsonb_array_elements(coalesce(old.state->'events','[]'::jsonb)) with ordinality items(e,ord);
  select coalesce(jsonb_agg(e-'checklistLinks'-'completedStarts' order by ord),'[]'::jsonb) into after_events from jsonb_array_elements(coalesce(new.state->'events','[]'::jsonb)) with ordinality items(e,ord);
  if before_events is distinct from after_events then
   insert into planner_google_fixed_sync(username,requested_revision) values(new.username,new.revision)
   on conflict(username) do update set requested_revision=excluded.requested_revision,retry_at=now(),error=null;
  end if;
 end if;
 return new;
end $$;
