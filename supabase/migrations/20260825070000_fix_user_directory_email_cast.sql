-- ==========================================================================
-- Fix: list_user_directory() returned HTTP 400 for every caller
-- ==========================================================================
-- auth.users.email is character varying(255), but the function declared its
-- second output column as `text`. PL/pgSQL's RETURN QUERY enforces an exact
-- type match against the declared result type, so the function raised
--   structure of query does not match function result type
--   DETAIL: Returned type character varying(255) does not match expected
--           type text in column 2
-- on every invocation. PostgREST surfaces that as a 400, which looked like a
-- permissions failure but was purely a type mismatch. Casting to text fixes
-- it without changing the function's contract with the client.

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
    select p.id, u.email::text, p.username, p.full_name, p.role, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at asc;
end;
$$ language plpgsql;

grant execute on function public.list_user_directory() to authenticated;
