-- Compare small ID/index maps, not full note bodies in a materialized join.
create or replace function public.planner_capture_note_history() returns trigger
language plpgsql set search_path=public as $$
declare old_files jsonb; new_files jsonb; old_index jsonb='{}'; new_index jsonb='{}';
 changed_id text; prior_item jsonb; next_item jsonb; fields text[]; i integer;
begin
 old_files=case when tg_op='INSERT' then '[]'::jsonb else coalesce(old.state->'files','[]'::jsonb) end;
 new_files=coalesce(new.state->'files','[]'::jsonb);
 if old_files=new_files then return new; end if;
 for i in 0..jsonb_array_length(old_files)-1 loop
  old_index=old_index||jsonb_build_object(old_files->i->>'id',i);
 end loop;
 for i in 0..jsonb_array_length(new_files)-1 loop
  new_index=new_index||jsonb_build_object(new_files->i->>'id',i);
 end loop;
 for changed_id in select jsonb_object_keys(old_index||new_index) loop
  prior_item=old_files->(old_index->>changed_id)::integer;next_item=new_files->(new_index->>changed_id)::integer;
  if prior_item is not distinct from next_item then continue; end if;
  if next_item->>'format'='note' or prior_item->>'format'='note' or exists(select 1 from planner_note_history h where h.username=new.username and h.note_id=changed_id) then
   select coalesce(array_agg(k order by k),'{}') into fields from unnest(array['name','content','richText','folderId','format','tags','pinned']) k where prior_item->k is distinct from next_item->k;
   if cardinality(fields)>0 or prior_item is null or next_item is null then
    insert into planner_note_history(username,note_id,name,kind,changed_fields,before,after,files_revision)
    values(new.username,changed_id,coalesce(next_item->>'name',prior_item->>'name'),case when next_item is null then 'removed' when prior_item is null then 'created' else 'updated' end,fields,prior_item,next_item,new.revision);
   end if;
  end if;
 end loop;
 return new;
end $$;

create or replace function public.planner_save_file_item(p_username text,p_revision bigint,p_item jsonb) returns jsonb
language plpgsql set search_path='' set statement_timeout='45s' as $$
declare workspace public.planner_files%rowtype; items jsonb; item_index integer; i integer; next_state jsonb;
begin
 if jsonb_typeof(p_item) is distinct from 'object' or coalesce(p_item->>'id','')='' then raise exception 'Invalid file item' using errcode='23514'; end if;
 select * into workspace from public.planner_files where username=p_username for update;
 if not found or workspace.revision<>p_revision then raise exception 'Files changed. Read the latest revision.' using errcode='P0001'; end if;
 items=coalesce(workspace.state->'files','[]'::jsonb);
 for i in 0..jsonb_array_length(items)-1 loop
  if items->i->>'id'=p_item->>'id' then item_index=i;exit;end if;
 end loop;
 if item_index is null then next_state=jsonb_set(workspace.state,'{files}',items||jsonb_build_array(p_item));
 else
  if items->item_index=p_item then return jsonb_build_object('revision',workspace.revision); end if;
  next_state=jsonb_set(workspace.state,array['files',item_index::text],p_item);
 end if;
 update public.planner_files set state=next_state,revision=revision+1,updated_at=now() where username=p_username;
 return jsonb_build_object('revision',p_revision+1);
end $$;
