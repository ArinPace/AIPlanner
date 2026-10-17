alter table public.planner_browser_accounts drop constraint planner_browser_accounts_source_check;
alter table public.planner_browser_accounts add constraint planner_browser_accounts_source_check check (source in ('brightspace','gradescope','gmail','calendar','drive','slack','instagram','x','albert','whatsapp','linkedin'));
