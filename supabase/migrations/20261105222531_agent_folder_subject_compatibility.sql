do $migration$
declare name text; definition text;
begin
 foreach name in array array['planner_sync_tutor_chats','planner_sync_subscription_tutors'] loop
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  definition=replace(definition,$old$f->>'parentId' is null and lower(trim(f->>'name'))='subjects'$old$,$new$(f->>'parentId' is null or exists(select 1 from jsonb_array_elements(folders) root where root->>'id'=f->>'parentId' and root->>'parentId' is null and lower(trim(root->>'name'))='agent')) and lower(trim(f->>'name'))='subjects'$new$);
  execute definition;
 end loop;
end $migration$;
