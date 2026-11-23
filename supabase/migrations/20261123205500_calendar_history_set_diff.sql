-- Extract event IDs once, then record only changed events in one set operation.
create or replace function public.planner_capture_calendar_history() returns trigger language plpgsql set search_path=public as $$
declare previous jsonb;
begin
 previous:=case when tg_op='INSERT' then '{}'::jsonb else old.state end;
 if previous->'events' is distinct from new.state->'events' then
  with before_events as materialized (
   select value->>'id' event_id,value from jsonb_array_elements(coalesce(previous->'events','[]'::jsonb))
  ), after_events as materialized (
   select value->>'id' event_id,value from jsonb_array_elements(coalesce(new.state->'events','[]'::jsonb))
  )
  insert into planner_calendar_history(username,event_id,title,kind,before,after,calendar_revision)
  select new.username,coalesce(a.event_id,b.event_id),coalesce(a.value->>'title',b.value->>'title',''),
   case when a.value is null then 'removed' when b.value is null then 'created' else 'updated' end,
   b.value,a.value,new.revision
  from before_events b full join after_events a on a.event_id=b.event_id
  where b.value is distinct from a.value;
 end if;
 if previous->'tags' is distinct from new.state->'tags' then
  insert into planner_calendar_history(username,title,kind,before,after,calendar_revision)
  values(new.username,'Calendar tags','tags',previous->'tags',new.state->'tags',new.revision);
 end if;
 return new;
end $$;
