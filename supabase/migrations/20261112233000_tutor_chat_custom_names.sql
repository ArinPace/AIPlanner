alter table public.planner_subscription_chats add column if not exists tutor_source_title text;
-- Remember the source separately from user-controlled conversation display names.
update public.planner_subscription_chats c set tutor_source_title=left(f->>'name',100)
from public.planner_files p cross join lateral jsonb_array_elements(coalesce(p.state->'folders','[]'::jsonb)) f
where p.username=c.username and c.tutor_subject_id=f->>'id' and c.tutor_source_title is null;
create or replace function public.planner_sync_subscription_tutors(p_username text) returns jsonb language plpgsql set search_path=public as $$
declare folders jsonb; roots text[]; active_ids text[];
begin
 perform pg_advisory_xact_lock(hashtextextended('planner-subscription-tutor:'||p_username,0));
 select state->'folders' into folders from planner_files where username=p_username;
 select array_agg(f->>'id') into roots from jsonb_array_elements(coalesce(folders,'[]'::jsonb)) f
 where (f->>'parentId' is null or exists(select 1 from jsonb_array_elements(folders) root where root->>'id'=f->>'parentId' and root->>'parentId' is null and lower(trim(root->>'name'))='agent')) and lower(trim(f->>'name'))='subjects';
 if roots is null then return jsonb_build_object('count',0); end if;
 select coalesce(array_agg(f->>'id'),'{}'::text[]) into active_ids from jsonb_array_elements(folders) f where f->>'parentId'=any(roots);
 insert into planner_subscription_chats(username,title,tutor_subject_id,tutor_source_title,pinned)
 select p_username,left(f->>'name',100),f->>'id',left(f->>'name',100),true from jsonb_array_elements(folders) f where f->>'id'=any(active_ids)
 on conflict(username,tutor_subject_id) do update set title=excluded.title,tutor_source_title=excluded.tutor_source_title,updated_at=now()
 where planner_subscription_chats.deleted_at is null and planner_subscription_chats.tutor_source_title is distinct from excluded.tutor_source_title;
 update planner_subscription_chats c set archived=true,tutor_retired=true,updated_at=now()
 where c.username=p_username and c.tutor_subject_id is not null and not c.tutor_retired and c.deleted_at is null and not(c.tutor_subject_id=any(active_ids))
 and not exists(select 1 from planner_subscription_tool_turns t where t.username=p_username and t.chat_id=c.id and t.status='running' and t.expires_at>now());
 return jsonb_build_object('count',cardinality(active_ids));
end $$;
revoke all on function public.planner_sync_subscription_tutors(text) from public,anon,authenticated;
grant execute on function public.planner_sync_subscription_tutors(text) to service_role;
