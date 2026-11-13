-- Files uploads belong directly to the account; chat association is optional.
alter table public.planner_subscription_files alter column chat_id drop not null;
