-- Non-destructive integration regression: all fixture data rolls back.
begin;
do $$
declare u text:='whoop_api_fixture'; c timestamptz; event_id uuid:='11111111-1111-4111-8111-111111111111'; saved_episode text; j uuid; changed boolean; sleep jsonb;
begin
 if exists(select 1 from planner_accounts where username=u) then raise exception 'Fixture username already exists'; end if;
 insert into planner_accounts(username,password_hash) values(u,'not-a-usable-password-hash');
 insert into planner_vm_settings(username,sources,schedule_enabled,subscription_schedule_enabled) values(u,array['gmail'],true,true);
 perform planner_connect_whoop(u,910000000000001,'encrypted-fixture-only');
 if not exists(select 1 from planner_vm_settings where username=u and sources=array['gmail','whoop'] and schedule_enabled and subscription_schedule_enabled) then raise exception 'Connection did not preserve preferences'; end if;
 select connected_at into c from planner_whoop_connections where username=u;
 sleep=jsonb_build_object('scoreState','PENDING_SCORE','sleepEnd',now()-interval '1 hour');
 perform planner_store_whoop_record(u,c,'sleep',event_id,sleep,'pending',now()-interval '3 minutes');
 if exists(select 1 from planner_whoop_reviews where username=u) then raise exception 'Processing record woke AI'; end if;
 sleep=jsonb_build_object('scoreState','SCORED','sleepEnd',now()-interval '1 hour','actualSleepMinutes',420);
 changed=planner_store_whoop_record(u,c,'sleep',event_id,sleep,'scored',now()-interval '2 minutes');
 if not changed or (select count(*) from planner_whoop_reviews where username=u and next_at is not null)<>2 then raise exception 'New scored data did not arm enabled channels'; end if;
 select r.episode into saved_episode from planner_whoop_reviews r where username=u and channel='chat';
 changed=planner_store_whoop_record(u,c,'sleep',event_id,sleep,'scored',now()-interval '1 minute');
 if changed or not exists(select 1 from planner_whoop_reviews r where username=u and channel='chat' and r.episode=saved_episode) then raise exception 'Unchanged record woke AI'; end if;
 -- Unchanged snapshots must advance their watermark so delayed older responses cannot overwrite current data.
 changed=planner_store_whoop_record(u,c,'sleep',event_id,sleep||'{"actualSleepMinutes":400}','older',now()-interval '90 seconds');
 if changed then raise exception 'Out-of-order record overwrote current data'; end if;
 perform planner_arm_whoop_review(u,'chat','ordinary-slot');
 if not exists(select 1 from planner_whoop_reviews r where username=u and channel='chat' and r.episode=saved_episode) then raise exception 'Ordinary review armed an hourly OAuth check'; end if;
 update planner_whoop_reviews set next_at=now()-interval '1 second' where username=u;
 j=planner_claim_whoop_chat(u);
 if j is null then raise exception 'New data was not claimable'; end if;
 if exists(select 1 from planner_whoop_reviews where username=u and channel='chat' and next_at is not null) then raise exception 'OAuth claim rearmed hourly polling'; end if;
 if planner_claim_whoop_chat(u) is not null then raise exception 'Data was claimed twice'; end if;
 perform planner_store_whoop_record(u,c,'sleep',event_id,'{"deleted":true}','deleted',now());
 if not exists(select 1 from planner_whoop_reviews where username=u and channel='chat' and next_at is not null) then raise exception 'Recent known deletion was ignored'; end if;
 perform planner_disconnect_whoop(u);
 if exists(select 1 from planner_whoop_connections where username=u) or exists(select 1 from planner_whoop_records where username=u) then raise exception 'Unlink retained credentials or records'; end if;
 if not exists(select 1 from planner_vm_settings where username=u and sources=array['gmail']) then raise exception 'Unlink changed unrelated sources'; end if;
 if planner_store_whoop_record(u,c,'sleep',event_id,sleep,'late',now()) then raise exception 'Stale authorization recreated disconnected data'; end if;
 if has_table_privilege('anon','public.planner_whoop_connections','select') or has_table_privilege('authenticated','public.planner_whoop_records','select') or has_function_privilege('anon','public.planner_store_whoop_record(text,timestamptz,text,uuid,jsonb,text,timestamptz)','execute') then raise exception 'Private integration is publicly accessible'; end if;
end $$;
rollback;
