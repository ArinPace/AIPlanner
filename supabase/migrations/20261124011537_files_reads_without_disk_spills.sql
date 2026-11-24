-- Do not materialize the entire Notes corpus in a set-returning function,
-- sort, or window aggregate just to read metadata or a single note.
-- Indexed JSON access keeps only the chosen item and small metadata in memory.
create or replace function public.planner_files_manifest(p_username text) returns jsonb
language plpgsql stable set search_path='' as $$
declare w public.planner_files%rowtype; section text; items jsonb; item jsonb;
 result jsonb='[]'; entry jsonb; text_value text; i integer; metadata_count integer=0;
begin
 select * into w from public.planner_files where username=p_username;
 if not found then return null; end if;
 foreach section in array array['documents','files','folders'] loop
  items=coalesce(w.state->section,'[]'::jsonb);
  for i in 0..jsonb_array_length(items)-1 loop
   item=items->i; text_value=item::text;
   if section<>'files' then metadata_count=metadata_count+1; end if;
   entry=jsonb_build_object('section',section,'id',item->>'id','index',i,'etag',md5(text_value),'bytes',octet_length(text_value));
   if section<>'files' and metadata_count<=256 and octet_length(text_value)<2048 then entry=entry||jsonb_build_object('value',item); end if;
   result=result||jsonb_build_array(entry);
  end loop;
 end loop;
 return jsonb_build_object('revision',w.revision,'items',result);
end $$;

create or replace function public.planner_read_file_item(p_username text,p_id text) returns jsonb
language plpgsql stable set search_path='' as $$
declare w public.planner_files%rowtype; section text; items jsonb; i integer;
begin
 select * into w from public.planner_files where username=p_username;
 if not found then return null; end if;
 foreach section in array array['files','documents'] loop
  items=coalesce(w.state->section,'[]'::jsonb);
  for i in 0..jsonb_array_length(items)-1 loop
   if items->i->>'id'=p_id then return jsonb_build_object('revision',w.revision,'section',section,'item',items->i); end if;
  end loop;
 end loop;
 return null;
end $$;

create or replace function public.planner_files_batch(p_username text,p_revision bigint,p_ids text[]) returns jsonb
language plpgsql stable set search_path='' as $$
declare w public.planner_files%rowtype; section text; items jsonb; chosen jsonb='[]'; i integer;
begin
 if cardinality(p_ids)<1 or cardinality(p_ids)>40 then raise exception 'Invalid batch' using errcode='23514'; end if;
 select * into w from public.planner_files where username=p_username;
 if not found or w.revision<>p_revision then raise exception 'Files changed while loading. Please retry.' using errcode='P0001'; end if;
 foreach section in array array['folders','files','documents'] loop
  items=coalesce(w.state->section,'[]'::jsonb);
  for i in 0..jsonb_array_length(items)-1 loop
   if items->i->>'id'=any(p_ids) then chosen=chosen||jsonb_build_array(items->i); end if;
  end loop;
 end loop;
 if jsonb_array_length(chosen)<>cardinality(p_ids) then raise exception 'Files changed while loading. Please retry.' using errcode='P0001'; end if;
 if octet_length(chosen::text)>3500000 then raise exception 'Read fewer items per batch' using errcode='23514'; end if;
 return jsonb_build_object('revision',w.revision,'items',chosen);
end $$;

create or replace function public.planner_canonical_note(p_username text,p_role text) returns jsonb
language plpgsql stable set search_path='' set statement_timeout='45s' as $$
declare w public.planner_files%rowtype; items jsonb; item jsonb; chosen jsonb; i integer;
begin
 select * into w from public.planner_files where username=p_username;
 if not found or p_role not in ('todo','work') then return null; end if;
 items=coalesce(w.state->'files','[]'::jsonb);
 for i in 0..jsonb_array_length(items)-1 loop
  item=items->i;
  if item->>'systemRole'=p_role then chosen=item; exit; end if;
  if chosen is null and ((p_role='todo' and lower(trim(item->>'name')) in ('to do','to-do','todo')) or (p_role='work' and item->>'folderId' is null and item->>'name'='Work')) then chosen=item; end if;
 end loop;
 if chosen is null then return null; end if;
 return jsonb_build_object('revision',w.revision,'partial',true,'folders',coalesce(w.state->'folders','[]'::jsonb),'files',jsonb_build_array(chosen),'documents','[]'::jsonb);
end $$;

create or replace function public.planner_ensure_planning_notes(p_username text) returns void
language plpgsql set search_path='public' as $$
declare current_state jsonb; next_files jsonb; role text; chosen integer; item jsonb; f jsonb;
 i integer; found_role boolean; changed boolean=false; best_root boolean; root boolean; best_date text;
begin
 -- The common read-only path does not acquire an update lock or spill note bodies.
 select state into current_state from planner_files where username=p_username;
 if current_state is null then return; end if;
 if jsonb_path_exists(current_state,'$.files[*] ? (@.systemRole == "goals")') and jsonb_path_exists(current_state,'$.files[*] ? (@.systemRole == "todo")') then return; end if;
 select state into current_state from planner_files where username=p_username for update;
 if current_state is null then return; end if;
 next_files=coalesce(current_state->'files','[]'::jsonb);
 foreach role in array array['goals','todo'] loop
  chosen=null; found_role=false; best_root=false; best_date=null;
  for i in 0..jsonb_array_length(next_files)-1 loop
   item=next_files->i;
   if item->>'systemRole'=role then found_role=true; exit; end if;
   if lower(regexp_replace(regexp_replace(item->>'name','\\.(txt|md)$','','i'),'[[:space:]_-]+','','g'))=any(case when role='goals' then array['goals'] else array['todo','todolist'] end) then
    root=item->>'folderId' is null;
    if chosen is null or (root and not best_root) or (root=best_root and ((item->>'updatedAt' is null and best_date is not null) or item->>'updatedAt'>best_date)) then
     chosen=i;best_root=root;best_date=item->>'updatedAt';
    end if;
   end if;
  end loop;
  if found_role then continue; end if;
  if chosen is null then
   f=jsonb_build_object('id',gen_random_uuid()::text,'folderId',null,'name',case when role='goals' then 'Goals' else 'To do' end,'content','','format','note','systemRole',role,'updatedAt',now());
   next_files=next_files||jsonb_build_array(f);
  else next_files=jsonb_set(next_files,array[chosen::text],next_files->chosen||jsonb_build_object('systemRole',role,'format','note'));
  end if;
  changed=true;
 end loop;
 if changed then update planner_files set state=jsonb_set(current_state,'{files}',next_files),revision=revision+1,updated_at=now() where username=p_username; end if;
end $$;
-- CREATE OR REPLACE retains each existing service-only ACL and caller security.
