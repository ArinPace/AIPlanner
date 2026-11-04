alter table public.planner_subscription_chats add column provider_snapshot jsonb;
alter table public.planner_subscription_chats add constraint planner_subscription_chat_snapshot_object check(provider_snapshot is null or jsonb_typeof(provider_snapshot)='object');
create unique index planner_subscription_chat_provider_unique on public.planner_subscription_chats(username,provider_url) where provider_url is not null;
