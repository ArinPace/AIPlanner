-- Add identity choices without replacing account keys, passwords, or account data.
alter table public.planner_accounts add column email text;
alter table public.planner_accounts add column email_verified boolean not null default false;
alter table public.planner_accounts add constraint planner_account_email_normalized check(email is null or (email=lower(btrim(email)) and length(email)<=254 and email like '%@%'));
create unique index planner_accounts_email_unique on public.planner_accounts(email) where email is not null;
create table public.planner_google_logins(
 google_sub text primary key,
 username text not null references public.planner_accounts(username) on delete cascade,
 email text not null,
 created_at timestamptz not null default now()
);
create index planner_google_logins_username on public.planner_google_logins(username);
create table public.planner_login_tickets(
 token_hash text primary key,
 google_sub text not null,
 email text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.planner_google_logins enable row level security;
alter table public.planner_login_tickets enable row level security;
revoke all on public.planner_google_logins,public.planner_login_tickets from public,anon,authenticated;
grant select,insert,update,delete on public.planner_google_logins,public.planner_login_tickets to service_role;
-- Calendar OAuth already verified these subjects while the owner was signed in.
-- Ambiguous identities are deliberately left for password-confirmed linking.
insert into public.planner_google_logins(google_sub,username,email)
 select google_sub,min(username),lower(min(identity)) from public.planner_google_accounts
 where identity like '%@%' group by google_sub having count(distinct username)=1;
with candidates as (
 select username,min(email) as email from public.planner_google_logins group by username having count(distinct email)=1
), unique_emails as (
 select email from public.planner_google_logins group by email having count(distinct username)=1
)
update public.planner_accounts a set email=c.email,email_verified=true
 from candidates c join unique_emails u on u.email=c.email
 where a.username=c.username and a.email is null;

create function public.planner_create_login_account(p_username text,p_password_hash text,p_email text,p_email_verified boolean,p_google_sub text,p_calendar jsonb,p_files jsonb)
returns void language plpgsql set search_path=public as $$
begin
 insert into public.planner_accounts(username,password_hash,email,email_verified) values(p_username,p_password_hash,p_email,p_email_verified);
 insert into public.planner_calendars(username,state) values(p_username,p_calendar);
 insert into public.planner_files(username,state) values(p_username,p_files);
 if p_google_sub is not null then insert into public.planner_google_logins(google_sub,username,email) values(p_google_sub,p_username,p_email);end if;
end;
$$;
revoke all on function public.planner_create_login_account(text,text,text,boolean,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.planner_create_login_account(text,text,text,boolean,text,jsonb,jsonb) to service_role;
