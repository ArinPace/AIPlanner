create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Vault is provisioned separately. Queue a short-lived signature, never the long-lived secret.
create or replace function public.planner_agent_tick()
returns bigint language plpgsql security definer set search_path=public,extensions as $$
declare
  stamp text := floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  secret text;
  request_id bigint;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name='planner_agent_cron_secret';
  if secret is null then raise exception 'planner scheduler secret is not provisioned'; end if;
  select net.http_post(
    url:='https://aiplanner-ten.vercel.app/api/agent/cron',
    headers:=jsonb_build_object('Content-Type','application/json','X-Planner-Timestamp',stamp,'X-Planner-Signature',encode(extensions.hmac(stamp,secret,'sha256'),'hex')),
    body:='{}'::jsonb,
    timeout_milliseconds:=60000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.planner_agent_tick() from public,anon,authenticated;
grant execute on function public.planner_agent_tick() to postgres;
select cron.schedule('ai-planner-agent-tick','* * * * *','select public.planner_agent_tick();');
