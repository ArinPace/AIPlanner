create table public.planner_note_history (
 id bigint generated always as identity primary key,
 username text not null references public.planner_calendars(username) on delete cascade,
 note_id text not null,
 name text not null,
 kind text not null check(kind in ('baseline','created','updated','removed')),
 changed_fields text[] not null default '{}',
 before jsonb,
 after jsonb,
 files_revision bigint not null,
 created_at timestamptz not null default now()
);
create index planner_note_history_owner_note on public.planner_note_history(username,note_id,id desc);
alter table public.planner_note_history enable row level security;
revoke all on public.planner_note_history from public,anon,authenticated;
grant select,insert on public.planner_note_history to service_role;
grant usage,select on sequence public.planner_note_history_id_seq to service_role;

create function public.planner_capture_note_history() returns trigger language plpgsql set search_path=public as $$
declare old_files jsonb; item record; fields text[];
begin
 old_files := case when tg_op='INSERT' then '[]'::jsonb else coalesce(old.state->'files','[]'::jsonb) end;
 for item in
  select coalesce(a.value->>'id',b.value->>'id') note_id,b.value prev,a.value next
  from jsonb_array_elements(old_files) b
  full join jsonb_array_elements(coalesce(new.state->'files','[]'::jsonb)) a on a.value->>'id'=b.value->>'id'
 loop
  if (coalesce(item.next,item.prev)->>'systemRole' in ('goals','todo')
    or lower(regexp_replace(coalesce(item.next,item.prev)->>'name','[^a-zA-Z0-9]','','g')) in ('goals','todo','wanttodo','agenttodo')
    or exists(select 1 from planner_note_history h where h.username=new.username and h.note_id=item.note_id)) then
   select coalesce(array_agg(k order by k),'{}') into fields from unnest(array['name','content','richText','folderId','format','tags','pinned']) k where item.prev->k is distinct from item.next->k;
   if cardinality(fields)>0 or item.prev is null or item.next is null then
    insert into planner_note_history(username,note_id,name,kind,changed_fields,before,after,files_revision)
    values(new.username,item.note_id,coalesce(item.next->>'name',item.prev->>'name'),case when item.next is null then 'removed' when item.prev is null then 'created' else 'updated' end,fields,item.prev,item.next,new.revision);
   end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.planner_capture_note_history() from public,anon,authenticated;
grant execute on function public.planner_capture_note_history() to service_role;
create trigger planner_note_history_capture after insert or update of state on public.planner_files for each row execute function public.planner_capture_note_history();
insert into public.planner_note_history(username,note_id,name,kind,after,files_revision)
select p.username,f->>'id',f->>'name','baseline',f,p.revision from public.planner_files p cross join lateral jsonb_array_elements(coalesce(p.state->'files','[]'::jsonb)) f
where f->>'systemRole' in ('goals','todo') or lower(regexp_replace(f->>'name','[^a-zA-Z0-9]','','g')) in ('goals','todo','wanttodo','agenttodo');
