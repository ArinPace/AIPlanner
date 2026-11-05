-- Document/folder-only edits retain protected notes unchanged; avoid scanning their full text.
create or replace function public.planner_protect_planning_notes() returns trigger language plpgsql set search_path=public as $$
declare note jsonb;
begin
 if old.state->'files' is not distinct from new.state->'files' then return new; end if;
 for note in select n from jsonb_array_elements(coalesce(old.state->'files','[]'::jsonb)) n where n->>'systemRole' in ('goals','todo') loop
  if not exists(select 1 from jsonb_array_elements(coalesce(new.state->'files','[]'::jsonb)) n where n->>'id'=note->>'id' and n->>'systemRole'=note->>'systemRole' and n->>'format'='note') then
   raise exception 'Goals and To do are permanent planning notes. You can edit or move them, but cannot remove them or convert them to text files.';
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(new.state->'files','[]'::jsonb)) n where n->>'systemRole' in ('goals','todo') group by n->>'systemRole' having count(*)>1) then raise exception 'There can be only one Goals and one To do system note.'; end if;
 return new;
end $$;
revoke all on function public.planner_protect_planning_notes() from public,anon,authenticated;
