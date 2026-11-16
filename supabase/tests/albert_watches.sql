begin;
do $$
declare u text:='albert_monitor_fixture'; h uuid; c uuid; w uuid; lease_id uuid; checked boolean; count_jobs bigint;
begin
 if exists(select 1 from planner_accounts where username=u) then raise exception 'Fixture exists'; end if;
 insert into planner_accounts(username,password_hash) values(u,'not-a-usable-password-hash');
 insert into planner_vm_settings(username,sources) values(u,array['albert']);
 insert into planner_vm_hosts(username,label,token_hash) values(u,'Fixture',repeat('0',64)) returning id into h;
 insert into planner_vm_chats(username,title,is_main) values(u,'Main Chat',true) returning id into c;
 insert into planner_albert_watches(username,title,url,config,enabled) values(u,'Class 12345','https://albert.nyu.edu/fixture','{"identityText":"Class 12345","intervalMinutes":5}',true) returning id into w;
 select (planner_claim_albert_watch(h)->>'lease')::uuid into lease_id;
 if lease_id is null then raise exception 'Watch not claimed'; end if;
 if planner_claim_albert_watch(h) is not null then raise exception 'Watch leased twice'; end if;
 checked=planner_report_albert_watch(u,h,w,lease_id,'closed','Closed fixture',c,'Fixture alert');
 if not checked or exists(select 1 from planner_vm_jobs where username=u) then raise exception 'Closed status woke an AI'; end if;
 update planner_albert_watches set next_at=now()-interval '1 second' where id=w;
 select (planner_claim_albert_watch(h)->>'lease')::uuid into lease_id;
 perform planner_report_albert_watch(u,h,w,lease_id,'open','Open fixture',c,'Fixture alert');
 select count(*) into count_jobs from planner_vm_jobs where username=u;
 if count_jobs<>1 then raise exception 'Opening did not queue exactly one alert'; end if;
 -- Unknown checks preserve last known open and cannot create another opening edge.
 update planner_albert_watches set next_at=now()-interval '1 second' where id=w;
 select (planner_claim_albert_watch(h)->>'lease')::uuid into lease_id;
 perform planner_report_albert_watch(u,h,w,lease_id,'unknown','Sign-in required',c,'Fixture alert');
 if not exists(select 1 from planner_albert_watches where id=w and last_status='open' and last_error='Sign-in required') then raise exception 'Unknown check destroyed last valid status'; end if;
 update planner_albert_watches set next_at=now()-interval '1 second' where id=w;
 select (planner_claim_albert_watch(h)->>'lease')::uuid into lease_id;
 perform planner_report_albert_watch(u,h,w,lease_id,'open','Open fixture',c,'Fixture alert');
 if (select count(*) from planner_vm_jobs where username=u)<>1 then raise exception 'Repeated open status duplicated an alert'; end if;
 if planner_report_albert_watch(u,h,w,lease_id,'open','Stale duplicate',c,'Fixture alert') then raise exception 'Stale lease was accepted'; end if;
 update planner_albert_watches set enabled=false,next_at=now()-interval '1 second' where id=w;
 if planner_claim_albert_watch(h) is not null then raise exception 'Disabled watch was claimed'; end if;
 if has_table_privilege('anon','public.planner_albert_watches','select') or has_function_privilege('authenticated','public.planner_claim_albert_watch(uuid)','execute') then raise exception 'Monitor storage is public'; end if;
end $$;
rollback;
