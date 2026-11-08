-- Original course PDFs upload directly to private Storage, not through a Vercel body.
alter table public.planner_uploads drop constraint planner_uploads_size_check;
alter table public.planner_uploads add constraint planner_uploads_size_check check (size between 1 and 52428800);
update storage.buckets set file_size_limit=52428800 where id='planner-pdfs';
