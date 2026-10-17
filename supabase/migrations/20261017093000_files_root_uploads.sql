-- PDFs may live directly in Files, as well as inside a folder.
alter table public.planner_uploads alter column folder_id drop not null;
