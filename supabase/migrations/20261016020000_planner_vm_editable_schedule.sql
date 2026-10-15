alter table public.planner_vm_settings
  add column if not exists schedule jsonb not null
  default '{"timezone":"America/New_York","times":["07:00","17:00"]}'::jsonb;
