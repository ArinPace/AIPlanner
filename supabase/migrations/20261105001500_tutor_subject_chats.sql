alter table public.planner_vm_settings add column tutor_enabled boolean not null default false;
alter table public.planner_vm_chats add column tutor_subject_id text;
alter table public.planner_vm_chats add constraint planner_tutor_subject_unique unique(username,tutor_subject_id);
alter table public.planner_vm_chats add constraint planner_tutor_subject_valid check(tutor_subject_id is null or (length(tutor_subject_id) between 1 and 200 and not is_main));
