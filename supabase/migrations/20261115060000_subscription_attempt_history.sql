-- Request receipts are independent of completed exchanges and never execute tools.
create table public.planner_subscription_attempts (
 id uuid primary key,
 username text not null,
 chat_id uuid not null references public.planner_subscription_chats(id) on delete cascade,
 prompt text not null check(length(prompt) between 1 and 12000),
 status text not null default 'started' check(status in ('started','submitted','failed','interrupted','completed')),
 detail text not null default '' check(length(detail)<=1000),
 partial_reply text not null default '' check(length(partial_reply)<=80000),
 submitted_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create index planner_subscription_attempts_history on public.planner_subscription_attempts(username,chat_id,created_at desc) where status <> 'completed';
alter table public.planner_subscription_attempts enable row level security;
revoke all on public.planner_subscription_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.planner_subscription_attempts to service_role;

create or replace function public.planner_save_relay_turn(p_username text,p_chat uuid,p_turn uuid,p_prompt text,p_reply text)
returns boolean language plpgsql security definer set search_path=public as $$
declare reply_id uuid := md5(p_turn::text||':assistant')::uuid; stamp timestamptz := clock_timestamp(); sent timestamptz;
begin
 perform 1 from planner_subscription_chats where id=p_chat and username=p_username and not archived and deleted_at is null for update;
 if not found then return false; end if;
 if length(p_prompt)<1 or length(p_prompt)>12000 or length(p_reply)<1 or length(p_reply)>80000 then raise exception 'invalid relay text' using errcode='22023'; end if;
 if exists(select 1 from planner_subscription_messages where id=p_turn) then
  if exists(select 1 from planner_subscription_messages where id=p_turn and username=p_username and chat_id=p_chat and role='user' and content=p_prompt)
   and exists(select 1 from planner_subscription_messages where id=reply_id and username=p_username and chat_id=p_chat and role='assistant' and content=p_reply) then
   update planner_subscription_attempts set status='completed',partial_reply='',detail='',updated_at=stamp where id=p_turn and username=p_username and chat_id=p_chat;
   return true;
  end if;
  raise exception 'relay request conflict' using errcode='23505';
 end if;
 select created_at into sent from planner_subscription_attempts where id=p_turn and username=p_username and chat_id=p_chat;
 insert into planner_subscription_messages(id,username,chat_id,role,content,created_at) values(p_turn,p_username,p_chat,'user',p_prompt,coalesce(sent,stamp)),(reply_id,p_username,p_chat,'assistant',p_reply,greatest(stamp,coalesce(sent,stamp)+interval '1 microsecond'));
 update planner_subscription_attempts set status='completed',partial_reply='',detail='',updated_at=stamp where id=p_turn and username=p_username and chat_id=p_chat;
 update planner_subscription_chats set updated_at=stamp,title=case when not is_main and title='New chat' then left(p_prompt,80) else title end where id=p_chat and username=p_username;
 return true;
end $$;
revoke all on function public.planner_save_relay_turn(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.planner_save_relay_turn(text,uuid,uuid,text,text) to service_role;
