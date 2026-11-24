-- Keep permanent-note safeguards, checking only ID/role metadata in memory.
create or replace function public.planner_protect_planning_notes() returns trigger
language plpgsql set search_path=public as $$
declare before_files jsonb; after_files jsonb; required jsonb='{}'; preserved jsonb='{}';
 roles jsonb='{}'; duplicate boolean=false; item jsonb; role text; note_id text; i integer;
begin
 if old.state->'files' is not distinct from new.state->'files' then return new; end if;
 before_files=coalesce(old.state->'files','[]'::jsonb);after_files=coalesce(new.state->'files','[]'::jsonb);
 for i in 0..jsonb_array_length(before_files)-1 loop
  item=before_files->i;
  if item->>'systemRole' in ('goals','todo') then required=required||jsonb_build_object(item->>'id',item->>'systemRole');end if;
 end loop;
 for i in 0..jsonb_array_length(after_files)-1 loop
  item=after_files->i;role=item->>'systemRole';note_id=item->>'id';
  if role in ('goals','todo') then
   if roles ? role then duplicate=true;end if;
   roles=roles||jsonb_build_object(role,true);
  end if;
  if required->>note_id=role and item->>'format'='note' then preserved=preserved||jsonb_build_object(note_id,true);end if;
 end loop;
 for note_id in select jsonb_object_keys(required) loop
  if not (preserved ? note_id) then raise exception 'Goals and To do are permanent planning notes. You can edit or move them, but cannot remove them or convert them to text files.';end if;
 end loop;
 if duplicate then raise exception 'There can be only one Goals and one To do system note.';end if;
 return new;
end $$;
