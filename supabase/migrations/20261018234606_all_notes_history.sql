create or replace function public.planner_capture_note_history() returns trigger language plpgsql set search_path=public as $$
declare old_files jsonb; item record; fields text[];
begin
 old_files := case when tg_op='INSERT' then '[]'::jsonb else coalesce(old.state->'files','[]'::jsonb) end;
 for item in
  select coalesce(a.value->>'id',b.value->>'id') note_id,b.value prev,a.value next
  from jsonb_array_elements(old_files) b
  full join jsonb_array_elements(coalesce(new.state->'files','[]'::jsonb)) a on a.value->>'id'=b.value->>'id'
 loop
  if (item.next->>'format'='note' or item.prev->>'format'='note'
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

insert into public.planner_note_history(username,note_id,name,kind,after,files_revision)
select p.username,f->>'id',f->>'name','baseline',f,p.revision from public.planner_files p cross join lateral jsonb_array_elements(coalesce(p.state->'files','[]'::jsonb)) f
where f->>'format'='note' and not exists(select 1 from public.planner_note_history h where h.username=p.username and h.note_id=f->>'id');
