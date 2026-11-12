alter table public.planner_vm_settings add column if not exists generation_options jsonb not null default '{}'::jsonb;
