-- Store only the user-authorized text exchange returned by the device relay.
-- This does not grant the website or its output any Planner tool permissions.
create function public.planner_save_relay_turn(p_username text,p_chat uuid,p_turn uuid,p_prompt text,p_reply text)
returns boolean language plpgsql security definer set search_path=public as $$
declare reply_id uuid := md5(p_turn::text||':assistant')::uuid; stamp timestamptz := clock_timestamp();
begin
 perform 1 from planner_subscription_chats where id=p_chat and username=p_username and not archived and deleted_at is null for update;
 if not found then return false; end if;
 if length(p_prompt)<1 or length(p_prompt)>12000 or length(p_reply)<1 or length(p_reply)>80000 then raise exception 'invalid relay text' using errcode='22023'; end if;
 if exists(select 1 from planner_subscription_messages where id=p_turn) then
  if exists(select 1 from planner_subscription_messages where id=p_turn and username=p_username and chat_id=p_chat and role='user' and content=p_prompt)
   and exists(select 1 from planner_subscription_messages where id=reply_id and username=p_username and chat_id=p_chat and role='assistant' and content=p_reply) then return true; end if;
  raise exception 'relay request conflict' using errcode='23505';
 end if;
 insert into planner_subscription_messages(id,username,chat_id,role,content,created_at) values(p_turn,p_username,p_chat,'user',p_prompt,stamp),(reply_id,p_username,p_chat,'assistant',p_reply,stamp+interval '1 microsecond');
 update planner_subscription_chats set updated_at=stamp,title=case when not is_main and title='New chat' then left(p_prompt,80) else title end where id=p_chat and username=p_username;
 return true;
end $$;
revoke all on function public.planner_save_relay_turn(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.planner_save_relay_turn(text,uuid,uuid,text,text) to service_role;
