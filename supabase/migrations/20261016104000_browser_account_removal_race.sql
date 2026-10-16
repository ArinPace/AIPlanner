create or replace function public.planner_browser_account_update(p_username text,p_source text,p_action text,p_identity text default null,p_id uuid default null,p_label text default null)
returns void language plpgsql set search_path = public as $$
declare account_row public.planner_browser_accounts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_username || ':' || p_source,0));
 if p_action = 'observe' then
   if not exists(select 1 from public.planner_vm_settings where username=p_username and p_source=any(sources)) then return; end if;
   if p_identity is not null then
     delete from public.planner_browser_accounts where username=p_username and source=p_source and account_key='browser-session' and label is null;
   end if;
   update public.planner_browser_accounts set active=false where username=p_username and source=p_source;
   insert into public.planner_browser_accounts(username,source,account_key,identity,active)
   values(p_username,p_source,coalesce(lower(p_identity),'browser-session'),p_identity,true)
   on conflict(username,source,account_key) do update set active=true,verified_at=now(),identity=excluded.identity;
 elsif p_action in ('rename','remove') then
   select * into account_row from public.planner_browser_accounts where id=p_id and username=p_username and source=p_source;
   if not found then raise exception 'Account not found' using errcode='P0002'; end if;
   if p_action='rename' then
     update public.planner_browser_accounts set label=p_label where id=account_row.id;
   else
     delete from public.planner_browser_accounts where id=account_row.id;
     if account_row.active then
       update public.planner_vm_settings set sources=array_remove(sources,p_source),sites=jsonb_set(sites,array[p_source],'{"ready":false}'::jsonb) where username=p_username;
     end if;
   end if;
 else raise exception 'Invalid account action';
 end if;
end;
$$;
revoke all on function public.planner_browser_account_update(text,text,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.planner_browser_account_update(text,text,text,text,uuid,text) to service_role;
