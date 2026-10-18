alter table public.planner_vm_jobs
 add column if not exists attachments jsonb not null default '[]'::jsonb,
 add column if not exists attachment_payload jsonb not null default '[]'::jsonb;
alter table public.planner_vm_jobs add constraint planner_vm_attachment_count
 check (jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=4 and jsonb_typeof(attachment_payload)='array' and jsonb_array_length(attachment_payload)<=4);
