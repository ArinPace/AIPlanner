alter table public.planner_vm_chats add column pinned boolean not null default false;
update public.planner_vm_chats set pinned=true where is_main;
alter table public.planner_vm_chats add constraint planner_main_always_pinned check (not is_main or pinned);
create function public.planner_pin_main_on_insert() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.is_main then new.pinned=true; end if;
 return new;
end $$;
revoke all on function public.planner_pin_main_on_insert() from public,anon,authenticated;
create trigger planner_main_pin_insert before insert on public.planner_vm_chats for each row execute function public.planner_pin_main_on_insert();
