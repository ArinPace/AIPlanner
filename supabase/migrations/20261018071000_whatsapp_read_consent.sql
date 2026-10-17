-- Existing settings ownership/RLS and server-only writes remain in force.
alter table public.planner_vm_settings add column if not exists whatsapp_read_consent_at timestamptz;
