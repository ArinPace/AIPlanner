create table public.planner_vm_approvals (
 id uuid primary key default gen_random_uuid(),
 username text not null,
 job_id uuid not null references public.planner_vm_jobs(id) on delete cascade,
 host_id uuid not null references public.planner_vm_hosts(id),
 lease uuid not null,
 questions jsonb not null,
 answers jsonb,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now() + interval '5 minutes'),
 answered_at timestamptz
);
alter table public.planner_vm_approvals enable row level security;
revoke all on public.planner_vm_approvals from public, anon, authenticated;
grant all on public.planner_vm_approvals to service_role;
create index planner_vm_approvals_job_idx on public.planner_vm_approvals(job_id);
