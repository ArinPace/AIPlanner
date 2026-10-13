create table public.planner_chat_links (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.planner_accounts(username) on delete cascade,
  title text not null check(length(title) between 1 and 120),
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(username,url)
);
create table public.planner_mcp_clients (
  id text primary key,
  name text not null,
  redirect_uris jsonb not null,
  created_at timestamptz not null default now()
);
create table public.planner_mcp_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.planner_mcp_clients(id) on delete cascade,
  redirect_uri text not null,
  state text not null,
  challenge text not null,
  scope text not null,
  browser_hash text not null,
  expires_at timestamptz not null
);
create table public.planner_mcp_codes (
  code_hash text primary key,
  username text not null references public.planner_accounts(username) on delete cascade,
  client_id text not null references public.planner_mcp_clients(id) on delete cascade,
  redirect_uri text not null,
  challenge text not null,
  scope text not null,
  expires_at timestamptz not null
);
create table public.planner_mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  username text not null references public.planner_accounts(username) on delete cascade,
  client_id text not null references public.planner_mcp_clients(id) on delete cascade,
  token_hash text not null unique,
  refresh_hash text not null unique,
  scope text not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.planner_mcp_browsers (
  username text primary key references public.planner_accounts(username) on delete cascade,
  browser_id uuid,
  reservation uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['planner_chat_links','planner_mcp_clients','planner_mcp_requests','planner_mcp_codes','planner_mcp_tokens','planner_mcp_browsers'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
  end loop;
end $$;

-- Authorization codes are consumed and refresh tokens rotated atomically, even on concurrent requests.
create function public.planner_mcp_exchange(p_code text,p_client text,p_redirect text,p_challenge text,p_access text,p_refresh text)
returns table(username text,scope text) language plpgsql security definer set search_path=public as $$
declare c planner_mcp_codes%rowtype;
begin
  delete from planner_mcp_codes where code_hash=p_code and client_id=p_client and redirect_uri=p_redirect and challenge=p_challenge and expires_at>now() returning * into c;
  if not found then return; end if;
  insert into planner_mcp_tokens(username,client_id,token_hash,refresh_hash,scope,expires_at,refresh_expires_at)
    values(c.username,c.client_id,p_access,p_refresh,c.scope,now()+interval '1 hour',now()+interval '30 days');
  return query select c.username,c.scope;
end $$;
create function public.planner_mcp_refresh(p_old text,p_client text,p_access text,p_refresh text)
returns table(username text,scope text) language sql security definer set search_path=public as $$
  update planner_mcp_tokens set token_hash=p_access,refresh_hash=p_refresh,expires_at=now()+interval '1 hour'
    where refresh_hash=p_old and client_id=p_client and revoked_at is null and refresh_expires_at>now()
    returning username,scope;
$$;
create function public.planner_mcp_reserve_browser(p_username text,p_reservation uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  insert into planner_mcp_browsers(username,reservation,expires_at) values(p_username,p_reservation,now()+interval '2 minutes')
    on conflict(username) do update set browser_id=null,reservation=excluded.reservation,expires_at=excluded.expires_at,created_at=now()
    where planner_mcp_browsers.expires_at<now();
  return found;
end $$;
revoke all on function public.planner_mcp_exchange(text,text,text,text,text,text),public.planner_mcp_refresh(text,text,text,text),public.planner_mcp_reserve_browser(text,uuid) from public,anon,authenticated;
grant execute on function public.planner_mcp_exchange(text,text,text,text,text,text),public.planner_mcp_refresh(text,text,text,text),public.planner_mcp_reserve_browser(text,uuid) to service_role;
