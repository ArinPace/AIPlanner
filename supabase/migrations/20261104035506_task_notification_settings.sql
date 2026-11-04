alter table public.planner_vm_settings add column task_notifications jsonb not null default '{}'::jsonb;
-- Existing owner-scoped server access and RLS continue to apply.
