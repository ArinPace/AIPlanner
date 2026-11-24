-- Cache only small, owner-scoped metadata, keyed by the authoritative workspace revision.
create table public.planner_files_manifest_cache(
 username text primary key references public.planner_files(username) on delete cascade,
 revision bigint not null,manifest jsonb not null
);
alter table public.planner_files_manifest_cache enable row level security;
revoke all on public.planner_files_manifest_cache from public,anon,authenticated;
grant select,insert,update,delete on public.planner_files_manifest_cache to service_role;
create or replace function public.planner_files_manifest_compute(p_username text) returns jsonb
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


revoke all on function public.planner_files_manifest_compute(text) from public,anon,authenticated;
grant execute on function public.planner_files_manifest_compute(text) to service_role;
create or replace function public.planner_files_manifest(p_username text) returns jsonb
language plpgsql volatile set search_path='' as $$
declare current_revision bigint; result jsonb;
begin
 select revision into current_revision from public.planner_files where username=p_username;
 if not found then return null; end if;
 select manifest into result from public.planner_files_manifest_cache where username=p_username and revision=current_revision;
 if found then return result; end if;
 result=public.planner_files_manifest_compute(p_username);
 if result is null then return null; end if;
 insert into public.planner_files_manifest_cache(username,revision,manifest)
 values(p_username,(result->>'revision')::bigint,result)
 on conflict(username) do update set revision=excluded.revision,manifest=excluded.manifest
 where planner_files_manifest_cache.revision<excluded.revision;
 return result;
end $$;
