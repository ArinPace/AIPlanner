-- Run against a development/maintenance connection. Every data change rolls back.
begin;
do $$
declare owner text='io_'||left(replace(gen_random_uuid()::text,'-',''),12);
 r bigint; current_r bigint; result jsonb; before_manifest jsonb; after_manifest jsonb;
 note jsonb; before_count bigint; role_count integer; blocked boolean=false;
begin
 insert into public.planner_accounts(username,password_hash) values(owner,'rollback-fixture-not-a-password');
 insert into public.planner_calendars(username,revision,state) values(owner,1,'{"events":[],"tags":[],"hiddenTagIds":[],"zoom":1}');
 insert into public.planner_files(username,revision,state) values(owner,1,jsonb_build_object(
  'folders',jsonb_build_array(jsonb_build_object('id','topic','name','Topic','parentId',null)),
  'files',jsonb_build_array(
   jsonb_build_object('id','root-todo','name','To do','format','note','content','Original','folderId',null,'updatedAt','2026-11-01'),
   jsonb_build_object('id','nested-todo','name','To do','format','note','content','Nested','folderId','topic','updatedAt','2026-11-23')),
  'documents','[]'::jsonb));
 perform public.planner_ensure_planning_notes(owner);
 select revision into r from public.planner_files where username=owner;
 perform public.planner_ensure_planning_notes(owner);
 if (select revision from public.planner_files where username=owner)<>r then raise exception 'Idempotent ensure wrote again';end if;
 result=public.planner_canonical_note(owner,'todo');
 if result#>>'{files,0,id}'<>'root-todo' then raise exception 'Canonical alias/root preference changed';end if;
 if public.planner_read_file_item('arin','root-todo') is not null then raise exception 'Owner isolation failed';end if;
 before_manifest=public.planner_files_manifest(owner);
 if before_manifest is distinct from public.planner_files_manifest_compute(owner) then raise exception 'Manifest cache differs';end if;
 select state#>'{files,0}' into note from public.planner_files where username=owner;
 select count(*) into before_count from public.planner_note_history where username=owner;
 result=public.planner_save_file_item(owner,r,note);
 if (result->>'revision')::bigint<>r then raise exception 'No-op save advanced revision';end if;
 if (select count(*) from public.planner_note_history where username=owner)<>before_count then raise exception 'No-op save created history';end if;
 note=jsonb_set(note,'{content}','"Changed"');
 result=public.planner_save_file_item(owner,r,note);current_r=(result->>'revision')::bigint;
 if current_r<>r+1 then raise exception 'Real edit revision failed';end if;
 if not exists(select 1 from public.planner_note_history where username=owner and note_id='root-todo' and files_revision=current_r and kind='updated' and before->>'content'='Original' and after->>'content'='Changed' and changed_fields=array['content']) then raise exception 'Edit history failed';end if;
 after_manifest=public.planner_files_manifest(owner);
 if (after_manifest->>'revision')::bigint<>current_r or after_manifest=before_manifest then raise exception 'Cache did not invalidate';end if;
 if after_manifest is distinct from public.planner_files_manifest_compute(owner) then raise exception 'Refreshed cache differs';end if;
 result=public.planner_files_batch(owner,current_r,array['root-todo']);
 if result#>>'{items,0,content}'<>'Changed' then raise exception 'Batch did not return edited content';end if;
 begin perform public.planner_save_file_item(owner,r,note);exception when sqlstate 'P0001' then blocked=true;end;
 if not blocked then raise exception 'Stale write allowed';end if;
 blocked=false;
 begin perform public.planner_workspace_delta_commit(owner,current_r,'{}',array['root-todo'],null,'{}'::uuid[],true);exception when sqlstate 'P0001' then blocked=position('permanent planning notes' in sqlerrm)>0;end;
 if not blocked then raise exception 'Permanent-note removal safeguard failed';end if;
 blocked=false;
 begin perform public.planner_save_file_item(owner,current_r,jsonb_set(note,'{format}','"text"'));exception when sqlstate 'P0001' then blocked=position('permanent planning notes' in sqlerrm)>0;end;
 if not blocked then raise exception 'Permanent-note format safeguard failed';end if;
 blocked=false;
 begin perform public.planner_save_file_item(owner,current_r,jsonb_build_object('id','duplicate','name','Duplicate','content','','format','note','systemRole','todo'));exception when sqlstate 'P0001' then blocked=position('only one' in sqlerrm)>0;end;
 if not blocked then raise exception 'Duplicate system-role safeguard failed';end if;
 result=public.planner_save_file_item(owner,current_r,jsonb_build_object('id','scratch','name','Scratch','content','Temporary','format','note'));current_r=(result->>'revision')::bigint;
 perform public.planner_workspace_delta_commit(owner,current_r,'{}',array['scratch'],null,'{}'::uuid[],true);
 if not exists(select 1 from public.planner_note_history where username=owner and note_id='scratch' and kind='removed' and before->>'content'='Temporary' and after is null) then raise exception 'Removal history failed';end if;
 if has_table_privilege('anon','public.planner_files_manifest_cache','select') or has_function_privilege('anon','public.planner_files_manifest_compute(text)','execute') then raise exception 'Private cache was exposed';end if;
end $$;
rollback;
