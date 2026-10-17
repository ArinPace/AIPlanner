create table public.planner_file_bin (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.planner_accounts(username) on delete cascade,
  names jsonb not null,
  snapshot jsonb not null,
  item_count integer not null check(item_count>0),
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days')
);
create index planner_file_bin_owner on public.planner_file_bin(username,deleted_at desc);
create index planner_file_bin_expiry on public.planner_file_bin(expires_at);
alter table public.planner_file_bin enable row level security;
revoke all on public.planner_file_bin from anon,authenticated;
grant select,insert,update,delete on public.planner_file_bin to service_role;
alter table public.planner_vm_chats add column deleted_at timestamptz;
create index planner_vm_chats_bin on public.planner_vm_chats(deleted_at) where deleted_at is not null;

-- Trusted API supplies the owner only after validating its own planner session.
-- Invoker permissions + explicit revokes keep these RPCs inaccessible to clients.
create function public.planner_mark_unused_pdfs(p_username text,p_ids text[]) returns void
language sql security invoker set search_path=public as $$
  update planner_uploads u set status='deleted'
  where u.username=p_username and u.id::text=any(p_ids)
    and not exists(select 1 from planner_files f,jsonb_array_elements(coalesce(f.state->'documents','[]')) d where f.username=p_username and d->>'id'=u.id::text)
    and not exists(select 1 from planner_file_bin b,jsonb_array_elements(coalesce(b.snapshot->'documents','[]')) d where b.username=p_username and d->>'id'=u.id::text);
$$;
revoke all on function public.planner_mark_unused_pdfs(text,text[]) from public,anon,authenticated;
grant execute on function public.planner_mark_unused_pdfs(text,text[]) to service_role;

create function public.planner_files_bin_commit(p_username text,p_revision bigint,p_state jsonb,p_add jsonb default null,p_remove uuid[] default '{}',p_restore boolean default true) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare current_revision bigint; bin_id uuid; found_count integer; pdfs text[];
begin
  select revision into current_revision from planner_files where username=p_username for update;
  if not found or current_revision<>p_revision then raise exception 'Files changed. Refresh before trying again.'; end if;
  if cardinality(p_remove)>0 then
    perform 1 from planner_file_bin where username=p_username and id=any(p_remove) and (not p_restore or expires_at>now()) for update;
    get diagnostics found_count=row_count;
    if found_count<>cardinality(p_remove) then raise exception 'Some Bin items are unavailable or expired. Refresh the Bin.'; end if;
    select array_agg(d->>'id') into pdfs from planner_file_bin b,jsonb_array_elements(coalesce(b.snapshot->'documents','[]')) d where b.username=p_username and b.id=any(p_remove) and d->>'kind'='pdf';
    delete from planner_file_bin where username=p_username and id=any(p_remove);
  end if;
  if p_add is not null then
    insert into planner_file_bin(username,names,snapshot,item_count) values(p_username,p_add->'names',p_add->'snapshot',(p_add->>'itemCount')::integer) returning id into bin_id;
  end if;
  update planner_files set state=p_state,revision=revision+1,updated_at=now() where username=p_username;
  perform planner_mark_unused_pdfs(p_username,coalesce(pdfs,'{}'));
  return jsonb_build_object('revision',current_revision+1,'binId',bin_id);
end $$;
revoke all on function public.planner_files_bin_commit(text,bigint,jsonb,jsonb,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.planner_files_bin_commit(text,bigint,jsonb,jsonb,uuid[],boolean) to service_role;

create function public.planner_manage_chats(p_username text,p_ids uuid[],p_action text) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare matched integer;
begin
  if cardinality(p_ids)<1 or cardinality(p_ids)>100 or p_action not in ('archive','restore','delete','untrash','purge') then raise exception 'Invalid chat selection.'; end if;
  perform 1 from planner_vm_chats where username=p_username and id=any(p_ids)
    and case when p_action in ('untrash','purge') then deleted_at is not null and (p_action='purge' or deleted_at>now()-interval '30 days') else deleted_at is null end for update;
  get diagnostics matched=row_count;
  if matched<>cardinality(p_ids) then raise exception 'Some selected chats are unavailable. Refresh the list.'; end if;
  if p_action='purge' then
    delete from planner_vm_chats where username=p_username and id=any(p_ids);
  elsif p_action='delete' then
    update planner_vm_chats set deleted_at=now(),updated_at=now() where username=p_username and id=any(p_ids);
    update planner_vm_jobs set status='cancelled',finished_at=now() where username=p_username and chat_id=any(p_ids) and status in ('queued','running');
  elsif p_action='untrash' then
    update planner_vm_chats set deleted_at=null,updated_at=now() where username=p_username and id=any(p_ids);
  else
    update planner_vm_chats set archived=(p_action='archive'),updated_at=now() where username=p_username and id=any(p_ids);
  end if;
  return jsonb_build_object('ok',true,'ids',to_jsonb(p_ids),'count',matched);
end $$;
revoke all on function public.planner_manage_chats(text,uuid[],text) from public,anon,authenticated;
grant execute on function public.planner_manage_chats(text,uuid[],text) to service_role;

create function public.planner_expire_bins() returns void
language plpgsql security invoker set search_path=public as $$
declare item record;
begin
  for item in delete from planner_file_bin where expires_at<=now() returning username,snapshot loop
    perform planner_mark_unused_pdfs(item.username,array(select d->>'id' from jsonb_array_elements(coalesce(item.snapshot->'documents','[]')) d where d->>'kind'='pdf'));
  end loop;
  delete from planner_vm_chats where deleted_at<=now()-interval '30 days';
end $$;
revoke all on function public.planner_expire_bins() from public,anon,authenticated;
grant execute on function public.planner_expire_bins() to service_role;
select cron.schedule('ai-planner-bin-retention','*/5 * * * *','select public.planner_expire_bins()');
