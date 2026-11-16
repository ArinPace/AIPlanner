alter table public.planner_vm_settings add column google_review_required boolean not null default false;
alter table public.planner_calendar_staging alter column account_id drop not null;
notify pgrst, 'reload schema';
