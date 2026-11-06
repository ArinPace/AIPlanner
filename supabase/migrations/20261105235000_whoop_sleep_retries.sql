create table if not exists public.planner_whoop_reviews (
 username text not null references public.planner_accounts(username) on delete cascade,
 channel text not null check (channel in ('agent','chat')),
 episode text not null,
 status text not null default 'pending' check(status in ('pending','fresh','blocked')),
 next_at timestamptz,
 checked_at timestamptz,
 observation jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(username,channel)
);
alter table public.planner_whoop_reviews enable row level security;
revoke all on public.planner_whoop_reviews from public,anon,authenticated;
grant all on public.planner_whoop_reviews to service_role;
create or replace function public.planner_arm_whoop_review(p_username text,p_channel text,p_episode text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from planner_vm_settings where username=p_username and 'whoop'=any(sources) and case when p_channel='agent' then schedule_enabled else subscription_schedule_enabled end) then return; end if;
 insert into planner_whoop_reviews(username,channel,episode,next_at) values(p_username,p_channel,p_episode,now()+interval '1 hour')
 on conflict(username,channel) do update set episode=excluded.episode,status='pending',next_at=least(coalesce(planner_whoop_reviews.next_at,excluded.next_at),excluded.next_at),updated_at=clock_timestamp()
 where planner_whoop_reviews.episode<>excluded.episode;
end $$;
create or replace function public.planner_queue_whoop_review(p_username text,p_host uuid,p_message text)
returns boolean language plpgsql security definer set search_path=public as $$
declare r planner_whoop_reviews; c planner_vm_chats; j uuid;
begin
 if not exists(select 1 from planner_vm_hosts where id=p_host and username=p_username and revoked_at is null) or not exists(select 1 from planner_vm_settings where username=p_username and schedule_enabled and 'whoop'=any(sources)) then return false; end if;
 select * into r from planner_whoop_reviews where username=p_username and channel='agent' and next_at<=now() for update skip locked;
 if not found then return false; end if;
 select * into c from planner_vm_chats where username=p_username and is_main and deleted_at is null and not archived;
 if not found or exists(select 1 from planner_vm_jobs where username=p_username and chat_id=c.id and status in ('queued','running','waiting','paused')) then return false; end if;
 insert into planner_vm_jobs(username,host_id,chat_id,thread_id,kind,schedule_slot,message)
 values(p_username,p_host,c.id,c.thread_id,'sync','whoop:'||r.next_at::text,p_message)
 on conflict(username,schedule_slot) do nothing returning id into j;
 if j is null then return false; end if;
 update planner_whoop_reviews set next_at=now()+interval '1 hour',updated_at=clock_timestamp() where username=p_username and channel='agent';
 return true;
end $$;
revoke all on function public.planner_arm_whoop_review(text,text,text), public.planner_queue_whoop_review(text,uuid,text) from public,anon,authenticated;
grant execute on function public.planner_arm_whoop_review(text,text,text), public.planner_queue_whoop_review(text,uuid,text) to service_role;
create or replace function public.planner_claim_whoop_chat(p_username text)
returns uuid language plpgsql security definer set search_path=public as $$
declare r planner_whoop_reviews; j uuid;
begin
 if not exists(select 1 from planner_vm_settings where username=p_username and subscription_schedule_enabled and 'whoop'=any(sources)) then return null; end if;
 select * into r from planner_whoop_reviews where username=p_username and channel='chat' and next_at<=now() for update skip locked;
 if not found then return null; end if;
 insert into planner_subscription_reviews(username,slot) values(p_username,'whoop:'||r.next_at::text) on conflict(username,slot) do nothing returning id into j;
 if j is null then return null; end if;
 update planner_whoop_reviews set next_at=now()+interval '1 hour',updated_at=clock_timestamp() where username=p_username and channel='chat';
 return j;
end $$;
revoke all on function public.planner_claim_whoop_chat(text) from public,anon,authenticated;
grant execute on function public.planner_claim_whoop_chat(text) to service_role;
