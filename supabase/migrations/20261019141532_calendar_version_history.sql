create table public.planner_calendar_history (
 id bigint generated always as identity primary key,
 username text not null references public.planner_calendars(username) on delete cascade,
 calendar_key text not null default 'internal',
 event_id text,
 title text not null default '',
 kind text not null,
 before jsonb,
 after jsonb,
 calendar_revision bigint,
 created_at timestamptz not null default now()
);
create index planner_calendar_history_owner on public.planner_calendar_history(username,id desc);
create index planner_calendar_history_event on public.planner_calendar_history(username,calendar_key,event_id,id desc);
alter table public.planner_calendar_history enable row level security;
revoke all on public.planner_calendar_history from public,anon,authenticated;
grant select,insert,update on public.planner_calendar_history to service_role;
grant usage,select on sequence public.planner_calendar_history_id_seq to service_role;
create function public.planner_capture_calendar_history() returns trigger language plpgsql set search_path=public as $$
declare item record; previous jsonb;
begin
 previous:=case when tg_op='INSERT' then '{}'::jsonb else old.state end;
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
 if previous->'tags' is distinct from new.state->'tags' then
  insert into planner_calendar_history(username,title,kind,before,after,calendar_revision)
  values(new.username,'Calendar tags','tags',previous->'tags',new.state->'tags',new.revision);
 end if;
 return new;
end $$;
revoke all on function public.planner_capture_calendar_history() from public,anon,authenticated;
grant execute on function public.planner_capture_calendar_history() to service_role;
create trigger planner_calendar_history_capture after insert or update of state on public.planner_calendars for each row execute function public.planner_capture_calendar_history();
insert into public.planner_calendar_history(username,event_id,title,kind,after,calendar_revision)
select c.username,e->>'id',coalesce(e->>'title',''),'baseline',e,c.revision from public.planner_calendars c cross join lateral jsonb_array_elements(coalesce(c.state->'events','[]'::jsonb)) e;
insert into public.planner_calendar_history(username,title,kind,after,calendar_revision)
select username,'Calendar tags','tags',state->'tags',revision from public.planner_calendars;
