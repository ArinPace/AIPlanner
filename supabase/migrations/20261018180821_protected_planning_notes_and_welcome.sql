alter table public.planner_vm_jobs add column is_welcome boolean not null default false;
create unique index planner_one_main_welcome on public.planner_vm_jobs(chat_id) where is_welcome;

create function public.planner_ensure_planning_notes(p_username text) returns void language plpgsql set search_path=public as $$
declare current_state jsonb; next_files jsonb; role text; chosen text; f jsonb; changed boolean=false;
begin
 select state into current_state from planner_files where username=p_username for update;
 if current_state is null then return; end if;
 next_files=coalesce(current_state->'files','[]'::jsonb);
 foreach role in array array['goals','todo'] loop
  if exists(select 1 from jsonb_array_elements(next_files) n where n->>'systemRole'=role) then continue; end if;
  select n->>'id' into chosen from jsonb_array_elements(next_files) n
   where lower(regexp_replace(regexp_replace(n->>'name','\.(txt|md)$','','i'),'[[:space:]_-]+','','g'))=any(case when role='goals' then array['goals'] else array['todo','todolist'] end)
   order by (n->>'folderId' is null) desc,n->>'updatedAt' desc limit 1;
  if chosen is null then
   f=jsonb_build_object('id',gen_random_uuid()::text,'folderId',null,'name',case when role='goals' then 'Goals' else 'To do' end,'content','','format','note','systemRole',role,'updatedAt',now());
   next_files=next_files||jsonb_build_array(f);
  else
   select jsonb_agg(case when n->>'id'=chosen then n||jsonb_build_object('systemRole',role,'format','note') else n end order by ord) into next_files from jsonb_array_elements(next_files) with ordinality a(n,ord);
  end if;
  changed=true;
 end loop;
 if changed then update planner_files set state=jsonb_set(current_state,'{files}',next_files),revision=revision+1,updated_at=now() where username=p_username; end if;
end $$;
revoke all on function public.planner_ensure_planning_notes(text) from public,anon,authenticated;
grant execute on function public.planner_ensure_planning_notes(text) to service_role;
do $$ declare owner text; begin for owner in select username from planner_files loop perform planner_ensure_planning_notes(owner); end loop; end $$;

create function public.planner_protect_planning_notes() returns trigger language plpgsql set search_path=public as $$
declare note jsonb;
begin
 for note in select n from jsonb_array_elements(coalesce(old.state->'files','[]'::jsonb)) n where n->>'systemRole' in ('goals','todo') loop
  if not exists(select 1 from jsonb_array_elements(coalesce(new.state->'files','[]'::jsonb)) n where n->>'id'=note->>'id' and n->>'systemRole'=note->>'systemRole' and n->>'format'='note') then
   raise exception 'Goals and To do are permanent planning notes. You can edit or move them, but cannot remove them or convert them to text files.';
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(new.state->'files','[]'::jsonb)) n where n->>'systemRole' in ('goals','todo') group by n->>'systemRole' having count(*)>1) then raise exception 'There can be only one Goals and one To do system note.'; end if;
 return new;
end $$;
revoke all on function public.planner_protect_planning_notes() from public,anon,authenticated;
create trigger planner_planning_notes_protection before update on public.planner_files for each row execute function public.planner_protect_planning_notes();
