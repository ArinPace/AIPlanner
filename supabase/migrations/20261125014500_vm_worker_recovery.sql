alter table public.planner_vm_provisioning
  add column if not exists recovery_heartbeat_at timestamptz,
  add column if not exists recovery_started_at timestamptz;
