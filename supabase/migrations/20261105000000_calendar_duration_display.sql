alter table public.planner_vm_settings add column week_scale_to_duration boolean not null default false;
alter table public.planner_vm_settings add column month_scale_to_duration boolean not null default false;
