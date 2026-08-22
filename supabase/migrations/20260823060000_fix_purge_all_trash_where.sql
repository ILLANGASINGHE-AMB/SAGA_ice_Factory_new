-- purge_all_trash() (20260823030000_purge_all_trash.sql) failed live with
-- "DELETE requires a WHERE clause": it's security definer, so it runs as
-- its owner (postgres on Supabase), which has the pg-safeupdate extension
-- enabled to catch accidental unfiltered DELETE/UPDATE — even inside a
-- function, even though this one is intentional. `where true` satisfies
-- the syntactic check while still deleting every row.
create or replace function public.purge_all_trash()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can permanently delete trash items';
  end if;

  delete from public.trash where true;
end;
$$;
