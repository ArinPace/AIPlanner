alter table public.planner_vm_settings add column message_read_consent jsonb not null default '{}'::jsonb check (jsonb_typeof(message_read_consent)='object');
