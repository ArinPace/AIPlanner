-- Account-owned source selection; the existing active account remains the only export target.
alter table public.planner_google_accounts add column read_enabled boolean not null default true;
-- Existing RLS and service-role-only grants continue to protect settings and credentials.
