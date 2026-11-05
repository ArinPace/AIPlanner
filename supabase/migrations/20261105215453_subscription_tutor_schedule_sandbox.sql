alter table public.planner_vm_settings
 add column agent_hidden boolean not null default false,
 add column subscription_schedule_enabled boolean not null default false,
 add column subscription_schedule jsonb;
alter table public.planner_subscription_chats
 add column tutor_subject_id text,
 add column tutor_retired boolean not null default false,
 add constraint subscription_tutor_subject_unique unique(username,tutor_subject_id),
 add constraint subscription_tutor_subject_valid check(tutor_subject_id is null or (length(tutor_subject_id) between 1 and 200 and not is_main));
create table public.planner_subscription_reviews (
 username text not null references public.planner_accounts(username) on delete cascade,
 slot text not null, id uuid not null default gen_random_uuid(),
 status text not null default 'claimed' check(status in ('claimed','completed','failed')),
 created_at timestamptz not null default now(), finished_at timestamptz,
 primary key(username,slot),unique(username,id)
);
alter table public.planner_subscription_reviews enable row level security;
revoke all on public.planner_subscription_reviews from public,anon,authenticated;
grant all on public.planner_subscription_reviews to service_role;
create or replace function public.planner_sync_subscription_tutors(p_username text) returns jsonb language plpgsql set search_path=public as $$
declare folders jsonb; roots text[]; active_ids text[];
begin
 perform pg_advisory_xact_lock(hashtextextended('planner-subscription-tutor:'||p_username,0));
 select state->'folders' into folders from planner_files where username=p_username;
 select array_agg(f->>'id') into roots from jsonb_array_elements(coalesce(folders,'[]'::jsonb)) f where f->>'parentId' is null and lower(trim(f->>'name'))='subjects';
 if roots is null then return jsonb_build_object('count',0); end if;
 select coalesce(array_agg(f->>'id'),'{}'::text[]) into active_ids from jsonb_array_elements(folders) f where f->>'parentId'=any(roots);
 insert into planner_subscription_chats(username,title,tutor_subject_id,pinned)
 select p_username,left(f->>'name',100),f->>'id',true from jsonb_array_elements(folders) f where f->>'id'=any(active_ids)
 on conflict(username,tutor_subject_id) do update set title=excluded.title
 where planner_subscription_chats.deleted_at is null and planner_subscription_chats.title is distinct from excluded.title;
 update planner_subscription_chats c set archived=true,tutor_retired=true,updated_at=now()
 where c.username=p_username and c.tutor_subject_id is not null and not c.tutor_retired and c.deleted_at is null and not(c.tutor_subject_id=any(active_ids))
 and not exists(select 1 from planner_subscription_tool_turns t where t.username=p_username and t.chat_id=c.id and t.status='running' and t.expires_at>now());
 return jsonb_build_object('count',cardinality(active_ids));
end $$;
revoke all on function public.planner_sync_subscription_tutors(text) from public,anon,authenticated;
grant execute on function public.planner_sync_subscription_tutors(text) to service_role;
