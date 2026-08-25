-- ==========================================================================
-- User Management: username field + admin directory listing
-- ==========================================================================
--
-- Settings gains a "User Management" section where an admin can see every
-- login account (username, email, display name, role) and add/edit/delete
-- them. This migration covers the two pieces that need real database
-- privileges beyond what a normal authenticated client can do:
--
-- 1. `username` — a new profile field, distinct from both the sign-in email
--    and the full display name (e.g. email "j.silva@sagacious.com", display
--    name "John Silva", username "john_silva"). Existing rows are backfilled
--    from their email's local part so the NOT NULL/UNIQUE constraints below
--    can be applied without breaking already-provisioned accounts.
--
-- 2. `list_user_directory()` — admin-only, returns every user's email
--    alongside their profile. Plain client queries can't read auth.users at
--    all (it isn't exposed through PostgREST), so without this the directory
--    table would have no way to show what email each account signs in with.
--
-- Actually CREATING, EDITING (email/password) and DELETING an account still
-- needs the Supabase Admin Auth API, which requires the service_role key —
-- that can only run in the `admin-users` Edge Function (supabase/functions/
-- admin-users/index.ts), never in the browser. This migration only covers
-- what can safely be done from a normal authenticated Postgres connection.

-- --------------------------------------------------------------------------
-- 1. profiles.username
-- --------------------------------------------------------------------------

alter table public.profiles add column if not exists username text;

-- Backfill: the local part of each account's email, de-duplicated by
-- appending the row's own id where two emails collide on that prefix (e.g.
-- j.silva@sagacious.com and j.silva@branch.com would otherwise both want
-- "j.silva"). Only touches rows that don't already have a username.
with backfill as (
  select
    p.id,
    split_part(u.email, '@', 1) as base
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username is null
),
deduped as (
  select
    id,
    case
      when count(*) over (partition by base) > 1
        then base || '_' || id::text
      else base
    end as final_username
  from backfill
)
update public.profiles p
set username = d.final_username
from deduped d
where p.id = d.id;

-- Any row that still has no username at this point (e.g. no matching
-- auth.users row) falls back to a value derived from its own id, so the
-- NOT NULL constraint below can never fail.
update public.profiles
set username = 'user_' || id::text
where username is null;

alter table public.profiles alter column username set not null;
alter table public.profiles drop constraint if exists profiles_username_unique;
alter table public.profiles add constraint profiles_username_unique unique (username);

-- --------------------------------------------------------------------------
-- 2. handle_new_user: pick up username from signup metadata
-- --------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    coalesce(new.raw_user_meta_data->>'role', 'user'),
    coalesce(new.raw_user_meta_data->>'username', 'user_' || new.id::text)
  );
  return new;
end;
$$ language plpgsql security definer;

-- --------------------------------------------------------------------------
-- 3. list_user_directory(): the only client-safe way to see login emails
-- --------------------------------------------------------------------------

create or replace function public.list_user_directory()
returns table (
  id uuid,
  email text,
  username text,
  full_name text,
  role text,
  created_at timestamp with time zone
)
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can view the user directory';
  end if;

  return query
    select p.id, u.email, p.username, p.full_name, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at asc;
end;
$$ language plpgsql;

grant execute on function public.list_user_directory() to authenticated;
