alter table public.planner_subscription_chats add column provider_url text check(provider_url is null or provider_url ~ '^https://chatgpt[.]com/(g/[A-Za-z0-9_-]+/)?c/[A-Za-z0-9_-]+$');
