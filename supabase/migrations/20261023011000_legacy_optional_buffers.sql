-- Seven legacy optional buffers predate planning metadata and color tags.
-- Keep them flexible instead of exporting them as appointments.
create or replace function public.planner_classify_events() returns trigger language plpgsql set search_path=public as $$
begin
 new.state:=jsonb_set(new.state,'{events}',coalesce((select jsonb_agg(e || jsonb_build_object('scheduleType',case
  when e->>'scheduleType' in ('fixed','planned') then e->>'scheduleType'
  when e->'planning' is not null and e->'planning'<>'null'::jsonb then 'planned'
  when lower(trim(e->>'title')) ~ '(optional|flexible) buffer$' then 'planned'
  when exists(select 1 from jsonb_array_elements(coalesce(new.state->'tags','[]')) t where e->'tagIds' ? (t->>'id') and lower(trim(t->>'name')) ~ '^(to[- ]?do|maintenance|maintaince|breaks?|buffers?)$') then 'planned'
  else 'fixed' end)) from jsonb_array_elements(coalesce(new.state->'events','[]')) e),'[]'));
 return new;
end $$;
update public.planner_calendars c set state=jsonb_set(c.state,'{events}',(select jsonb_agg(case when e->>'scheduleType'='fixed' and lower(trim(e->>'title')) ~ '(optional|flexible) buffer$' then e || '{"scheduleType":"planned"}'::jsonb else e end) from jsonb_array_elements(c.state->'events') e)),revision=revision+1,updated_at=now()
where exists(select 1 from jsonb_array_elements(c.state->'events') e where e->>'scheduleType'='fixed' and lower(trim(e->>'title')) ~ '(optional|flexible) buffer$');
