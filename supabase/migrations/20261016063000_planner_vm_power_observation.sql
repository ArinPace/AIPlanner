alter table public.planner_vm_provisioning
  add column if not exists power_state text,
  add column if not exists power_updated_at timestamptz;
